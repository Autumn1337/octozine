import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { chat, type ChatMessage } from "../llm/openai-compatible.js";
import { parseProfile } from "../config.js";
import type { Profile } from "../types.js";

export type RepoSignalSource = "owned" | "starred";

export type RepoSignal = {
  fullName: string;
  description: string;
  topics: string[];
  stars: number;
  fork: boolean;
  archived: boolean;
  source: RepoSignalSource;
  language?: string;
  pushedAt?: string;
};

export type StarredItem = RepoSignal & { source: "starred" };

export type UserProfileSignal = {
  login: string;
  name?: string;
  bio?: string;
  company?: string;
  blog?: string;
  location?: string;
};

export type ActivitySignal = {
  repo: string;
  types: string[];
  latestAt?: string;
};

export type ReadmeSignal = {
  repo: string;
  excerpt: string;
};

export type WeightedStat = {
  name: string;
  weight: number;
  count: number;
};

export type ProfileContext = {
  user: UserProfileSignal;
  explicitPreferences: {
    include: string[];
    exclude: string[];
  };
  ownedRepos: RepoSignal[];
  starredRepos: StarredItem[];
  activityRepos: ActivitySignal[];
  readmeExcerpts: ReadmeSignal[];
  stats: {
    languages: WeightedStat[];
    topics: WeightedStat[];
    owners: WeightedStat[];
  };
};

type RepoApi = {
  full_name: string;
  description: string | null;
  topics?: string[];
  stargazers_count?: number;
  fork?: boolean;
  archived?: boolean;
  language: string | null;
  pushed_at?: string | null;
};

function repoFromApi(r: RepoApi, source: RepoSignalSource): RepoSignal {
  return {
    fullName: r.full_name,
    description: r.description ?? "",
    topics: r.topics ?? [],
    stars: r.stargazers_count ?? 0,
    fork: r.fork ?? false,
    archived: r.archived ?? false,
    source,
    ...(r.language ? { language: r.language } : {}),
    ...(r.pushed_at ? { pushedAt: r.pushed_at } : {}),
  };
}

export function parseStarredResponse(json: unknown): StarredItem[] {
  if (!Array.isArray(json)) return [];
  return (json as RepoApi[])
    .filter(r => Boolean(r.full_name))
    .map(r => ({ ...repoFromApi(r, "starred"), source: "starred" as const }));
}

export function parseOwnedReposResponse(json: unknown): RepoSignal[] {
  if (!Array.isArray(json)) return [];
  return (json as RepoApi[])
    .filter(r => Boolean(r.full_name))
    .map(r => repoFromApi(r, "owned"));
}

type UserApi = {
  login: string;
  name?: string | null;
  bio?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
};

export function parseUserProfile(json: unknown, fallbackLogin: string): UserProfileSignal {
  const u = (json ?? {}) as UserApi;
  return {
    login: u.login ?? fallbackLogin,
    ...(u.name ? { name: u.name } : {}),
    ...(u.bio ? { bio: u.bio } : {}),
    ...(u.company ? { company: u.company } : {}),
    ...(u.blog ? { blog: u.blog } : {}),
    ...(u.location ? { location: u.location } : {}),
  };
}

type EventApi = {
  type?: string;
  repo?: { name?: string };
  created_at?: string;
};

export function parseUserEvents(json: unknown): ActivitySignal[] {
  if (!Array.isArray(json)) return [];
  const byRepo = new Map<string, ActivitySignal>();
  for (const e of json as EventApi[]) {
    if (!e.repo?.name || !e.type) continue;
    const prev = byRepo.get(e.repo.name);
    if (!prev) {
      byRepo.set(e.repo.name, {
        repo: e.repo.name,
        types: [e.type],
        ...(e.created_at ? { latestAt: e.created_at } : {}),
      });
      continue;
    }
    if (!prev.types.includes(e.type)) prev.types.push(e.type);
    if (e.created_at && (!prev.latestAt || e.created_at > prev.latestAt)) prev.latestAt = e.created_at;
  }
  return Array.from(byRepo.values());
}

function ghHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "octozine/0.1",
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export type FetchStarredOpts = {
  username: string;
  token?: string | undefined;
  limit?: number;
};

export async function fetchStarred(opts: FetchStarredOpts): Promise<StarredItem[]> {
  const limit = opts.limit ?? 150;
  const items: StarredItem[] = [];
  for (let page = 1; items.length < limit; page++) {
    const perPage = Math.min(100, limit - items.length);
    const url =
      `https://api.github.com/users/${encodeURIComponent(opts.username)}/starred` +
      `?per_page=${perPage}&page=${page}&sort=updated`;
    const res = await fetch(url, { headers: ghHeaders(opts.token) });
    if (!res.ok) throw new Error(`starred fetch failed: HTTP ${res.status}`);
    const batch = parseStarredResponse(await res.json());
    if (batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items.slice(0, limit);
}

export async function fetchOwnedRepos(opts: FetchStarredOpts): Promise<RepoSignal[]> {
  const limit = opts.limit ?? 100;
  const items: RepoSignal[] = [];
  for (let page = 1; items.length < limit; page++) {
    const perPage = Math.min(100, limit - items.length);
    const url =
      `https://api.github.com/users/${encodeURIComponent(opts.username)}/repos` +
      `?per_page=${perPage}&page=${page}&sort=updated&type=owner`;
    const res = await fetch(url, { headers: ghHeaders(opts.token) });
    if (!res.ok) throw new Error(`owned repos fetch failed: HTTP ${res.status}`);
    const batch = parseOwnedReposResponse(await res.json());
    if (batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items.slice(0, limit);
}

export async function fetchUserProfile(opts: { username: string; token?: string }): Promise<UserProfileSignal> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(opts.username)}`, {
    headers: ghHeaders(opts.token),
  });
  if (!res.ok) throw new Error(`user profile fetch failed: HTTP ${res.status}`);
  return parseUserProfile(await res.json(), opts.username);
}

export async function fetchUserEvents(opts: FetchStarredOpts): Promise<ActivitySignal[]> {
  const perPage = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const url =
    `https://api.github.com/users/${encodeURIComponent(opts.username)}/events/public` +
    `?per_page=${perPage}`;
  const res = await fetch(url, { headers: ghHeaders(opts.token) });
  if (!res.ok) throw new Error(`user events fetch failed: HTTP ${res.status}`);
  return parseUserEvents(await res.json()).slice(0, opts.limit ?? 50);
}

export async function fetchReadmeExcerpt(
  repo: string,
  opts: { token?: string; maxChars?: number } = {},
): Promise<ReadmeSignal | null> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;
  const headers = ghHeaders(opts.token);
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`,
    { headers },
  );
  if (!res.ok) return null;
  const json = await res.json() as { content?: string; encoding?: string };
  if (json.encoding !== "base64" || !json.content) return null;
  const decoded = Buffer.from(json.content.replace(/\s/g, ""), "base64").toString("utf8");
  const compact = decoded
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return null;
  return { repo, excerpt: compact.slice(0, opts.maxChars ?? 2000) };
}

function addWeighted(map: Map<string, WeightedStat>, raw: string | undefined, weight: number): void {
  const name = raw?.trim().toLowerCase();
  if (!name) return;
  const prev = map.get(name) ?? { name, weight: 0, count: 0 };
  prev.weight += weight;
  prev.count += 1;
  map.set(name, prev);
}

function statList(map: Map<string, WeightedStat>, limit: number): WeightedStat[] {
  return Array.from(map.values())
    .sort((a, b) => b.weight - a.weight || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(s => ({ ...s, weight: Number(s.weight.toFixed(2)) }));
}

export function analyzeProfileSignals(
  ownedRepos: RepoSignal[],
  starredRepos: StarredItem[],
  activityRepos: ActivitySignal[],
): ProfileContext["stats"] {
  const languages = new Map<string, WeightedStat>();
  const topics = new Map<string, WeightedStat>();
  const owners = new Map<string, WeightedStat>();

  const addRepo = (repo: RepoSignal, baseWeight: number) => {
    const weight = Math.max(0.05, baseWeight + (repo.fork ? -0.35 : 0) + (repo.archived ? -0.25 : 0));
    addWeighted(languages, repo.language, weight);
    for (const topic of repo.topics) addWeighted(topics, topic, weight);
    addWeighted(owners, repo.fullName.split("/")[0], weight);
  };

  for (const r of ownedRepos) addRepo(r, 1.0);
  for (const r of starredRepos) addRepo(r, 0.35);
  for (const a of activityRepos) addWeighted(owners, a.repo.split("/")[0], 0.75);

  return {
    languages: statList(languages, 12),
    topics: statList(topics, 20),
    owners: statList(owners, 12),
  };
}

export type BuildProfileContextOpts = {
  username: string;
  token?: string;
  explicitInclude?: string[];
  explicitExclude?: string[];
  readmeRepos?: number;
  starredLimit?: number;
  activityLimit?: number;
  fetchUserProfileFn?: typeof fetchUserProfile;
  fetchOwnedReposFn?: typeof fetchOwnedRepos;
  fetchStarredFn?: typeof fetchStarred;
  fetchUserEventsFn?: typeof fetchUserEvents;
  fetchReadmeExcerptFn?: typeof fetchReadmeExcerpt;
};

export async function buildProfileContext(opts: BuildProfileContextOpts): Promise<ProfileContext> {
  const userFn = opts.fetchUserProfileFn ?? fetchUserProfile;
  const ownedFn = opts.fetchOwnedReposFn ?? fetchOwnedRepos;
  const starredFn = opts.fetchStarredFn ?? fetchStarred;
  const eventsFn = opts.fetchUserEventsFn ?? fetchUserEvents;
  const readmeFn = opts.fetchReadmeExcerptFn ?? fetchReadmeExcerpt;
  const token = opts.token;

  const [userResult, ownedResult, starredResult, eventsResult] = await Promise.allSettled([
    userFn({ username: opts.username, ...(token ? { token } : {}) }),
    ownedFn({ username: opts.username, ...(token ? { token } : {}), limit: 100 }),
    starredFn({
      username: opts.username,
      ...(token ? { token } : {}),
      limit: opts.starredLimit ?? 150,
    }),
    eventsFn({
      username: opts.username,
      ...(token ? { token } : {}),
      limit: opts.activityLimit ?? 50,
    }),
  ]);

  const user = userResult.status === "fulfilled"
    ? userResult.value
    : { login: opts.username };
  const ownedRepos = ownedResult.status === "fulfilled" ? ownedResult.value : [];
  const starredRepos = starredResult.status === "fulfilled" ? starredResult.value : [];
  const activityRepos = eventsResult.status === "fulfilled" ? eventsResult.value : [];

  for (const [name, result] of [
    ["user", userResult],
    ["owned", ownedResult],
    ["starred", starredResult],
    ["events", eventsResult],
  ] as const) {
    if (result.status === "rejected") {
      console.warn(`[profile] ${name} signal failed:`, (result.reason as Error).message);
    }
  }

  if (ownedRepos.length === 0 && starredRepos.length === 0 && activityRepos.length === 0) {
    throw new Error(`profile generation: ${opts.username} has no usable GitHub signals`);
  }

  const candidateReadmes = uniqueRepos([
    ...ownedRepos.filter(r => !r.fork && !r.archived).map(r => r.fullName),
    ...activityRepos.map(a => a.repo),
    ...starredRepos.filter(r => !r.archived).map(r => r.fullName),
  ]).slice(0, opts.readmeRepos ?? 8);

  const readmeExcerpts: ReadmeSignal[] = [];
  for (const repo of candidateReadmes) {
    try {
      const signal = await readmeFn(repo, { ...(token ? { token } : {}), maxChars: 2000 });
      if (signal) readmeExcerpts.push(signal);
    } catch (e) {
      console.warn(`[profile] readme ${repo} failed:`, (e as Error).message);
    }
  }

  return {
    user,
    explicitPreferences: {
      include: opts.explicitInclude ?? [],
      exclude: opts.explicitExclude ?? [],
    },
    ownedRepos,
    starredRepos,
    activityRepos,
    readmeExcerpts,
    stats: analyzeProfileSignals(ownedRepos, starredRepos, activityRepos),
  };
}

function uniqueRepos(repos: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const repo of repos) {
    const key = repo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(repo);
  }
  return out;
}

function repoLine(r: RepoSignal): string {
  const parts = [
    r.fullName,
    r.language ? `[${r.language}]` : "",
    r.topics.length ? `(topics: ${r.topics.slice(0, 8).join(", ")})` : "",
    `stars:${r.stars}`,
    r.fork ? "fork" : "",
    r.archived ? "archived" : "",
    r.pushedAt ? `pushed:${r.pushedAt.slice(0, 10)}` : "",
  ].filter(Boolean).join(" ");
  return `- ${parts}${r.description ? ` — ${r.description.slice(0, 180)}` : ""}`;
}

export function buildProfilePrompt(context: ProfileContext, username: string): ChatMessage[] {
  const user = [
    `login: ${context.user.login}`,
    context.user.name ? `name: ${context.user.name}` : "",
    context.user.bio ? `bio: ${context.user.bio}` : "",
    context.user.company ? `company: ${context.user.company}` : "",
    context.user.blog ? `blog: ${context.user.blog}` : "",
  ].filter(Boolean).join("\n");

  const payload = [
    "# user",
    user,
    "",
    "# explicit preferences (highest priority)",
    `include: ${JSON.stringify(context.explicitPreferences.include)}`,
    `exclude: ${JSON.stringify(context.explicitPreferences.exclude)}`,
    "",
    "# strong signals: owned repositories",
    context.ownedRepos.slice(0, 30).map(repoLine).join("\n") || "(none)",
    "",
    "# strong signals: recent public activity",
    context.activityRepos.slice(0, 30).map(a =>
      `- ${a.repo} activity:${a.types.join(",")} ${a.latestAt ? `latest:${a.latestAt.slice(0, 10)}` : ""}`,
    ).join("\n") || "(none)",
    "",
    "# weak signals: starred repositories",
    context.starredRepos.slice(0, 80).map(repoLine).join("\n") || "(none)",
    "",
    "# readme excerpts from representative repos",
    context.readmeExcerpts.map(r => `## ${r.repo}\n${r.excerpt}`).join("\n\n") || "(none)",
    "",
    "# weighted local statistics",
    `languages: ${JSON.stringify(context.stats.languages)}`,
    `topics: ${JSON.stringify(context.stats.topics)}`,
    `owners: ${JSON.stringify(context.stats.owners)}`,
  ].join("\n");

  return [
    {
      role: "system",
      content:
        "You create a precise GitHub interest profile from multi-signal evidence. " +
        "Owned repositories and recent activity override starred repositories. " +
        "Starred repositories are weak signals unless repeated across topics/languages. " +
        "Explicit include/exclude preferences are hard constraints. " +
        "Avoid generic themes such as open source, software development, AI tools, web apps, or productivity. " +
        "Return ONLY strict JSON matching the requested schema.",
    },
    {
      role: "user",
      content:
        `User: ${username}\n\n${payload}\n\n` +
        "Extract a profile JSON with this shape: " +
        '{"version":2,"core_themes":[{"name":string,"weight":0-1,"confidence":"low|medium|high","evidence":[{"source":"explicit|profile|owned_repo|activity_repo|starred_repo|readme","repo":string optional,"note":string}]}],"secondary_themes":[],"languages":[{"name":string,"weight":0-1,"evidence_count":integer}],"exclude_themes":[{"name":string,"confidence":"low|medium|high","reason":string}],"notes":string}. ' +
        "Every core theme must include evidence. Use 3-6 core themes and 0-4 secondary themes.",
    },
  ];
}

const EvidenceGenSchema = z.object({
  source: z.enum(["explicit", "profile", "owned_repo", "activity_repo", "starred_repo", "readme"]),
  repo: z.string().optional(),
  note: z.string().min(1),
});

// LLMs sometimes ignore the "weight ∈ [0,1]" instruction in the prompt and
// emit raw counts (e.g. weight: 2.75 for Python with 6 evidence). We accept
// any non-negative number here and normalize per-group to [0,1] downstream
// in generateProfile, so a misbehaving model doesn't blow up the whole run.
const ThemeGenSchema = z.object({
  name: z.string().min(3),
  weight: z.number().min(0),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(EvidenceGenSchema).min(1),
});

const ProfileGenSchema = z.object({
  version: z.literal(2),
  core_themes: z.array(ThemeGenSchema).min(1),
  secondary_themes: z.array(ThemeGenSchema),
  languages: z.array(z.object({
    name: z.string().min(1),
    weight: z.number().min(0),
    evidence_count: z.number().int().nonnegative(),
  })),
  exclude_themes: z.array(z.object({
    name: z.string().min(1),
    confidence: z.enum(["low", "medium", "high"]),
    reason: z.string().min(1),
  })),
  notes: z.string().min(1),
});

/**
 * Rescale a list's `weight` so the maximum is exactly 1.0, preserving
 * relative ratios. No-op when all weights are already ≤ 1.
 * Floors weight at 0 (defensive — schema already enforces >= 0).
 */
function normalizeWeights<T extends { weight: number }>(items: T[]): T[] {
  if (items.length === 0) return items;
  const maxW = items.reduce((m, i) => Math.max(m, i.weight), 0);
  if (maxW <= 1) return items;
  return items.map(i => ({ ...i, weight: Number((i.weight / maxW).toFixed(2)) }));
}

export type GenerateProfileOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

async function chatJsonWithRetry(llm: GenerateProfileOpts, messages: ChatMessage[], label: string): Promise<string> {
  const callOnce = () =>
    chat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages,
      responseFormat: "json",
      temperature: 0.25,
    });
  try {
    return await callOnce();
  } catch (e) {
    console.warn(`[profile] ${label} first attempt failed, retrying:`, (e as Error).message);
    return await callOnce();
  }
}

export async function generateProfile(
  context: ProfileContext,
  username: string,
  llm: GenerateProfileOpts,
  generatedAt = new Date().toISOString().slice(0, 10),
): Promise<Profile> {
  const draftRaw = await chatJsonWithRetry(llm, buildProfilePrompt(context, username), "extract");
  const criticMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a strict reviewer for GitHub interest profiles. Remove generic themes, " +
        "downgrade themes based only on weak starred evidence, enforce explicit excludes, " +
        "and return ONLY corrected strict JSON in the same schema.",
    },
    {
      role: "user",
      content:
        `Original evidence summary:\n` +
        `explicit_include=${JSON.stringify(context.explicitPreferences.include)}\n` +
        `explicit_exclude=${JSON.stringify(context.explicitPreferences.exclude)}\n` +
        `owned_repos=${context.ownedRepos.length}, starred_repos=${context.starredRepos.length}, ` +
        `activity_repos=${context.activityRepos.length}, readmes=${context.readmeExcerpts.length}\n\n` +
        `Draft JSON:\n${draftRaw}\n\nReturn the final corrected JSON now.`,
    },
  ];
  const finalRaw = await chatJsonWithRetry(llm, criticMessages, "critic");

  let parsed: z.infer<typeof ProfileGenSchema>;
  try {
    parsed = ProfileGenSchema.parse(JSON.parse(finalRaw));
  } catch (e) {
    throw new Error(`profile generation: LLM output not valid: ${(e as Error).message}\nraw: ${finalRaw}`);
  }

  return {
    version: 2,
    generatedFrom: {
      username,
      generatedAt,
      signals: {
        ownedRepos: context.ownedRepos.length,
        starredRepos: context.starredRepos.length,
        activityRepos: context.activityRepos.length,
        readmes: context.readmeExcerpts.length,
      },
    },
    coreThemes: normalizeWeights(parsed.core_themes.map(t => ({
      name: t.name,
      weight: t.weight,
      confidence: t.confidence,
      evidence: t.evidence,
    }))),
    secondaryThemes: normalizeWeights(parsed.secondary_themes.map(t => ({
      name: t.name,
      weight: t.weight,
      confidence: t.confidence,
      evidence: t.evidence,
    }))),
    languages: normalizeWeights(parsed.languages.map(l => ({
      name: l.name.toLowerCase(),
      weight: l.weight,
      evidenceCount: l.evidence_count,
    }))),
    excludeThemes: parsed.exclude_themes.map(t => ({
      name: t.name,
      confidence: t.confidence,
      reason: t.reason,
    })),
    notes: parsed.notes,
  };
}

export type SerializeMeta = { generatedAt: string; username: string };

export function serializeProfileYaml(p: Profile, meta: SerializeMeta): string {
  const body = yaml.dump({
    version: 2,
    generated_from: {
      username: p.generatedFrom.username || meta.username,
      generated_at: p.generatedFrom.generatedAt || meta.generatedAt,
      signals: {
        owned_repos: p.generatedFrom.signals.ownedRepos,
        starred_repos: p.generatedFrom.signals.starredRepos,
        activity_repos: p.generatedFrom.signals.activityRepos,
        readmes: p.generatedFrom.signals.readmes,
      },
    },
    core_themes: p.coreThemes,
    secondary_themes: p.secondaryThemes,
    languages: p.languages.map(l => ({
      name: l.name,
      weight: l.weight,
      evidence_count: l.evidenceCount,
    })),
    exclude_themes: p.excludeThemes,
    notes: p.notes,
  }, { lineWidth: 100, noRefs: true });
  return `# generated ${meta.generatedAt} from ${meta.username}'s GitHub signals\n# edit freely; this file is read each run.\n${body}`;
}

// YAML 1.1 accepts `True` / `TRUE` as boolean true; tolerate either case so
// flipping the regenerate flag doesn't silently no-op.
export function flipRegenerateToFalse(configText: string): string {
  return configText.replace(/(\bregenerate:\s*)[Tt][Rr][Uu][Ee]\b/, "$1false");
}

export type EnsureProfileOpts = {
  root: string;
  username: string;
  regenerate: boolean;
  explicitInclude?: string[];
  explicitExclude?: string[];
  readmeRepos?: number;
  starredLimit?: number;
  activityLimit?: number;
  llm: GenerateProfileOpts;
  ghToken?: string | undefined;
  buildContextFn?: (o: BuildProfileContextOpts) => Promise<ProfileContext>;
  generateFn?: (c: ProfileContext, u: string, l: GenerateProfileOpts, generatedAt: string) => Promise<Profile>;
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
    `[profile] ${exists ? "regenerating (regenerate: true)" : "missing — generating"} from @${opts.username}'s GitHub signals…`,
  );
  const generatedAt = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const buildContextFn = opts.buildContextFn ?? buildProfileContext;
  const context = await buildContextFn({
    username: opts.username,
    ...(opts.ghToken ? { token: opts.ghToken } : {}),
    explicitInclude: opts.explicitInclude ?? [],
    explicitExclude: opts.explicitExclude ?? [],
    readmeRepos: opts.readmeRepos,
    starredLimit: opts.starredLimit,
    activityLimit: opts.activityLimit,
  });
  const generateFn = opts.generateFn ?? generateProfile;
  const profile = await generateFn(context, opts.username, opts.llm, generatedAt);

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
