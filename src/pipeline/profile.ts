import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { chat, type ChatMessage } from "../llm/openai-compatible.js";
import { parseProfile } from "../config.js";
import type { Profile } from "../types.js";

export type StarredItem = {
  fullName: string;
  description: string;
  topics: string[];
  language?: string;
};

type StarredApi = {
  full_name: string;
  description: string | null;
  topics?: string[];
  language: string | null;
};

export function parseStarredResponse(json: unknown): StarredItem[] {
  if (!Array.isArray(json)) return [];
  const out: StarredItem[] = [];
  for (const r of json as StarredApi[]) {
    if (!r.full_name) continue;
    out.push({
      fullName: r.full_name,
      description: r.description ?? "",
      topics: r.topics ?? [],
      ...(r.language ? { language: r.language } : {}),
    });
  }
  return out;
}

export type FetchStarredOpts = { username: string; token?: string | undefined };

export async function fetchStarred(opts: FetchStarredOpts): Promise<StarredItem[]> {
  const headers: Record<string, string> = {
    "User-Agent": "octozine/0.1",
    Accept: "application/vnd.github+json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const url = `https://api.github.com/users/${encodeURIComponent(opts.username)}/starred?per_page=100`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`starred fetch failed: HTTP ${res.status}`);
  return parseStarredResponse(await res.json());
}

export function buildProfilePrompt(starred: StarredItem[], username: string): ChatMessage[] {
  const lines = starred
    .slice(0, 100)
    .map(s => {
      const lang = s.language ? ` [${s.language}]` : "";
      const topics = s.topics.length ? ` (topics: ${s.topics.slice(0, 6).join(", ")})` : "";
      const desc = s.description ? ` — ${s.description.slice(0, 160)}` : "";
      return `- ${s.fullName}${lang}${topics}${desc}`;
    })
    .join("\n");
  return [
    {
      role: "system",
      content:
        "You analyze a GitHub user's starred repositories and produce a personalized interest profile. " +
        "Return JSON with this exact shape: " +
        '{"themes": string[], "languages": string[], "exclude_themes": string[], "notes": string}. ' +
        "themes: 3-6 short English noun phrases describing what the user is into. " +
        "languages: 2-5 programming languages, lowercase. " +
        "exclude_themes: 0-3 topics the user clearly avoids (often empty). " +
        "notes: 1-3 sentences in English summarizing the user's apparent preferences. " +
        "Output ONLY the JSON object, no prose.",
    },
    {
      role: "user",
      content:
        `User: ${username}\n\nStarred repos (most-recent first):\n${lines}\n\n` +
        "Produce the profile JSON now.",
    },
  ];
}

const ProfileGenSchema = z.object({
  themes: z.array(z.string()).min(1),
  languages: z.array(z.string()),
  exclude_themes: z.array(z.string()),
  notes: z.string(),
});

export type GenerateProfileOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export async function generateProfile(
  starred: StarredItem[],
  username: string,
  llm: GenerateProfileOpts,
): Promise<Profile> {
  if (starred.length === 0) {
    throw new Error(`profile generation: ${username} has zero starred repos; cannot infer interests`);
  }
  const messages = buildProfilePrompt(starred, username);

  const callOnce = () =>
    chat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages,
      responseFormat: "json",
      temperature: 0.3,
    });

  let raw: string;
  try {
    raw = await callOnce();
  } catch (e) {
    console.warn(`[profile] first attempt failed, retrying:`, (e as Error).message);
    raw = await callOnce();
  }

  let parsed: z.infer<typeof ProfileGenSchema>;
  try {
    parsed = ProfileGenSchema.parse(JSON.parse(raw));
  } catch (e) {
    throw new Error(`profile generation: LLM output not valid: ${(e as Error).message}\nraw: ${raw}`);
  }
  return {
    themes: parsed.themes,
    languages: parsed.languages,
    excludeThemes: parsed.exclude_themes,
    notes: parsed.notes,
  };
}

export type SerializeMeta = { generatedAt: string; username: string };

export function serializeProfileYaml(p: Profile, meta: SerializeMeta): string {
  const body = yaml.dump({
    themes: p.themes,
    languages: p.languages,
    exclude_themes: p.excludeThemes,
    notes: p.notes,
  }, { lineWidth: 100, noRefs: true });
  return `# generated ${meta.generatedAt} from ${meta.username}'s starred repos\n# edit freely; this file is read each run.\n${body}`;
}

// YAML 1.1 accepts `True` / `TRUE` as boolean true; tolerate either case so
// flipping the regenerate flag doesn't silently no-op (which would force
// re-generation every run, burning LLM tokens until the user notices).
export function flipRegenerateToFalse(configText: string): string {
  return configText.replace(/(\bregenerate:\s*)[Tt][Rr][Uu][Ee]\b/, "$1false");
}

export type EnsureProfileOpts = {
  root: string;
  username: string;
  regenerate: boolean;
  llm: GenerateProfileOpts;
  ghToken?: string | undefined;
  fetchStarredFn?: (o: FetchStarredOpts) => Promise<StarredItem[]>;
  generateFn?: (s: StarredItem[], u: string, l: GenerateProfileOpts) => Promise<Profile>;
  now?: Date;
};

export async function ensureProfile(opts: EnsureProfileOpts): Promise<Profile> {
  const profilePath = path.join(opts.root, "config/profile.yaml");
  const configPath  = path.join(opts.root, "config/config.yaml");
  const exists = existsSync(profilePath);

  if (exists && !opts.regenerate) {
    return parseProfile(await readFile(profilePath, "utf8"));
  }

  console.log(
    `[profile] ${exists ? "regenerating (regenerate: true)" : "missing — generating"} from @${opts.username}'s starred…`,
  );
  const starredFn = opts.fetchStarredFn ?? fetchStarred;
  const starred = await starredFn({
    username: opts.username,
    ...(opts.ghToken ? { token: opts.ghToken } : {}),
  });
  const generateFn = opts.generateFn ?? generateProfile;
  const profile = await generateFn(starred, opts.username, opts.llm);

  const generatedAt = (opts.now ?? new Date()).toISOString().slice(0, 10);
  await writeFile(
    profilePath,
    serializeProfileYaml(profile, { generatedAt, username: opts.username }),
    "utf8",
  );
  console.log(`[profile] wrote ${profilePath}`);

  if (opts.regenerate) {
    const cfgText = await readFile(configPath, "utf8");
    const flipped = flipRegenerateToFalse(cfgText);
    if (flipped !== cfgText) {
      await writeFile(configPath, flipped, "utf8");
      console.log(`[profile] flipped config.profile.regenerate → false`);
    } else {
      console.warn(
        `[profile] could not flip config.profile.regenerate to false ` +
        `(unrecognized YAML formatting). Please edit config/config.yaml manually ` +
        `to avoid re-generating the profile on every run.`,
      );
    }
  }
  return profile;
}
