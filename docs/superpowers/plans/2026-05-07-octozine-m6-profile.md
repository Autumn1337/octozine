# Octozine M6 — Profile auto-generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Auto-generate `config/profile.yaml` from a user's GitHub starred repos when they fork the project (or explicitly request a refresh), removing the manual setup step that was the single biggest "fork barrier" identified during M5/M8.

**Architecture:** A new pipeline pre-step `ensureProfile(root, config, llm)` runs before fetch. It checks: (a) `profile.yaml` missing, OR (b) `config.profile.regenerate: true`. If either, it pulls the user's last 100 starred repos via GitHub REST, sends a single LLM call to summarize the user's interests, and writes a fresh `profile.yaml` with a `# generated YYYY-MM-DD from {username}'s starred` header. It also flips `regenerate: true` back to `false` via a string-level rewrite (preserving the YAML's inline comments — js-yaml dump would drop them). The Action commits both files alongside the new issue.

**Tech Stack:** Reuse existing `chat()` adapter (JSON mode), `node:fetch` for starred listing, no new deps.

---

## Pre-conditions

This plan runs on branch `feat/m6-profile` (already created). Before any task starts, run `npm test` and confirm 64/64 baseline passing.

## File Structure

**Create:**
- `src/pipeline/profile.ts` — `fetchStarred`, `generateProfile`, `serializeProfileYaml`, `ensureProfile`, `flipRegenerateToFalse`
- `tests/pipeline/profile.test.ts`
- `tests/fixtures/starred.json` — recorded starred response (~10 entries)

**Modify:**
- `src/index.ts` — call `ensureProfile` before `parseProfile`; commit logic stays in CI workflow
- `tests/e2e.test.ts` — add a case where regenerate=true triggers generation
- `config/config.yaml` — no shape change, comment update only
- `docs/setup.md` — explain auto-generation behavior on first run
- `.github/workflows/daily.yml` — make commit-back step include `config/profile.yaml` and `config/config.yaml`

---

## Task 1: profile generator module

**Files:**
- Create: `src/pipeline/profile.ts`
- Create: `tests/pipeline/profile.test.ts`
- Create: `tests/fixtures/starred.json`

The module exposes four pure-ish functions:

1. `fetchStarred({ username, token? }) -> StarredItem[]` — pulls `/users/{u}/starred?per_page=100` (one page; the user's most-recent-100 is plenty signal).
2. `buildProfilePrompt(starred, username) -> ChatMessage[]` — constructs system+user messages instructing the LLM to emit a JSON of `{themes: string[], languages: string[], excludeThemes: string[], notes: string}`.
3. `generateProfile(starred, username, llm) -> Profile` — calls `chat()` with `responseFormat: "json"`, validates with zod, returns a `Profile`.
4. `serializeProfileYaml(profile, meta) -> string` — emits YAML matching `parseProfile`'s shape, prefixed with the generated-on header comment.

- [ ] **Step 1: Record fixture once**

```bash
curl -s -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/torvalds/starred?per_page=10" \
  > tests/fixtures/starred.json
test -s tests/fixtures/starred.json && echo "starred fixture recorded"
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/pipeline/profile.test.ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  parseStarredResponse,
  buildProfilePrompt,
  serializeProfileYaml,
  flipRegenerateToFalse,
} from "../../src/pipeline/profile.js";
import { parseProfile } from "../../src/config.js";

describe("parseStarredResponse", () => {
  it("extracts owner/repo + description + topics from a real starred payload", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/starred.json", import.meta.url), "utf8"),
    );
    const out = parseStarredResponse(json);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.fullName).toMatch(/^[^/]+\/[^/]+$/);
      expect(typeof s.description).toBe("string");
      expect(Array.isArray(s.topics)).toBe(true);
    }
  });
});

describe("buildProfilePrompt", () => {
  it("includes user's starred repos and asks for a JSON profile", () => {
    const messages = buildProfilePrompt(
      [{ fullName: "rust-lang/rust", description: "Empowering everyone", topics: ["rust"], language: "Rust" }],
      "alice",
    );
    expect(messages.length).toBe(2);
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.role).toBe("user");
    expect(messages[1]!.content).toContain("rust-lang/rust");
    expect(messages[1]!.content).toContain("alice");
    expect(messages[0]!.content.toLowerCase()).toContain("json");
  });
});

describe("serializeProfileYaml", () => {
  it("round-trips through parseProfile", () => {
    const p = {
      themes: ["LLM tooling"],
      languages: ["rust", "python"],
      excludeThemes: ["web3"],
      notes: "low-level prefs",
    };
    const yaml = serializeProfileYaml(p, { generatedAt: "2026-05-07", username: "alice" });
    expect(yaml).toContain("# generated 2026-05-07 from alice");
    const reparsed = parseProfile(yaml);
    expect(reparsed).toEqual(p);
  });
});

describe("flipRegenerateToFalse", () => {
  it("flips boolean true to false preserving comments", () => {
    const cfg = `# octozine config
profile:
  regenerate: true             # set true and re-run to refresh
schedule: weekly
`;
    const out = flipRegenerateToFalse(cfg);
    expect(out).toContain("regenerate: false");
    expect(out).toContain("# set true and re-run to refresh");
    expect(out).toContain("schedule: weekly");
  });

  it("is idempotent when already false", () => {
    const cfg = "profile:\n  regenerate: false\n";
    expect(flipRegenerateToFalse(cfg)).toBe(cfg);
  });
});
```

- [ ] **Step 3: Run tests, confirm fail**

```bash
npm test -- tests/pipeline/profile.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the module**

```ts
// src/pipeline/profile.ts
import { z } from "zod";
import yaml from "js-yaml";
import { chat } from "../llm/openai-compatible.js";
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

export function buildProfilePrompt(
  starred: StarredItem[],
  username: string,
): { role: "system" | "user"; content: string }[] {
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
        '{"themes": string[3-6], "languages": string[2-5], "exclude_themes": string[0-3], "notes": string}. ' +
        "themes describe what the user is into (one short English noun phrase each). " +
        "languages are programming languages, lowercase. " +
        "exclude_themes are topics the user clearly avoids (often empty). " +
        "notes is a 1-3 sentence English summary of the user's apparent preferences. " +
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
  let raw: string;
  try {
    raw = await chat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages,
      responseFormat: "json",
      temperature: 0.3,
    });
  } catch (e) {
    raw = await chat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages,
      responseFormat: "json",
      temperature: 0.3,
    });
    void e;
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

/**
 * String-level rewrite of `regenerate: true` → `regenerate: false`.
 * We avoid yaml.dump round-trip because it strips inline comments.
 */
export function flipRegenerateToFalse(configText: string): string {
  return configText.replace(/(\bregenerate:\s*)true\b/, "$1false");
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
npm test -- tests/pipeline/profile.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/profile.ts tests/pipeline/profile.test.ts tests/fixtures/starred.json
git commit -m "feat(profile): module for starred-fetch + LLM-inferred profile.yaml"
```

---

## Task 2: ensureProfile + wire into pipeline

**Files:**
- Modify: `src/pipeline/profile.ts` — add `ensureProfile` orchestrator
- Modify: `src/index.ts` — call `ensureProfile` before reading profile
- Modify: `tests/e2e.test.ts` — add regenerate-triggered generation case

`ensureProfile(root, config, llm)` returns the (possibly newly written) Profile. It also writes the fresh YAML and flips the regenerate flag.

- [ ] **Step 1: Add `ensureProfile` to profile.ts**

```ts
// src/pipeline/profile.ts (append)
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import yamlLib from "js-yaml";
import { parseProfile } from "../config.js";

export type EnsureProfileOpts = {
  root: string;
  username: string;
  regenerate: boolean;
  llm: GenerateProfileOpts;
  ghToken?: string | undefined;
  /** test seam — override the starred fetcher */
  fetchStarredFn?: (o: FetchStarredOpts) => Promise<StarredItem[]>;
  /** test seam — override the LLM call */
  generateFn?: (s: StarredItem[], u: string, l: GenerateProfileOpts) => Promise<Profile>;
  /** test seam — fixed clock */
  now?: Date;
};

export async function ensureProfile(opts: EnsureProfileOpts): Promise<Profile> {
  const profilePath = path.join(opts.root, "config/profile.yaml");
  const configPath  = path.join(opts.root, "config/config.yaml");
  const exists = existsSync(profilePath);

  if (exists && !opts.regenerate) {
    return parseProfile(await readFile(profilePath, "utf8"));
  }

  console.log(`[profile] ${exists ? "regenerating (regenerate: true)" : "missing — generating"} from @${opts.username}'s starred…`);
  const starredFn = opts.fetchStarredFn ?? fetchStarred;
  const starred = await starredFn({ username: opts.username, ...(opts.ghToken ? { token: opts.ghToken } : {}) });
  const generateFn = opts.generateFn ?? generateProfile;
  const profile = await generateFn(starred, opts.username, opts.llm);

  const generatedAt = (opts.now ?? new Date()).toISOString().slice(0, 10);
  await writeFile(profilePath, serializeProfileYaml(profile, { generatedAt, username: opts.username }), "utf8");
  console.log(`[profile] wrote ${profilePath}`);

  if (opts.regenerate) {
    const cfgText = await readFile(configPath, "utf8");
    const flipped = flipRegenerateToFalse(cfgText);
    if (flipped !== cfgText) {
      await writeFile(configPath, flipped, "utf8");
      console.log(`[profile] flipped config.profile.regenerate → false`);
    }
  }
  return profile;
}
```

Note: `yamlLib` import is already implicit via the existing `import yaml from "js-yaml"` at the top of the file — drop the duplicate import or alias correctly. (If the linter complains, leave the existing top-of-file `yaml` import alone and skip adding `yamlLib`.)

- [ ] **Step 2: Wire into `src/index.ts`**

Replace the current profile-loading block:

```ts
const profText = await readFile(path.join(root, "config/profile.yaml"), "utf8");
const config = parseConfig(cfgText);
const profile = parseProfile(profText);
```

with:

```ts
const config = parseConfig(cfgText);

const apiKey = process.env.LLM_API_KEY;
if (!apiKey) throw new Error("LLM_API_KEY env var is required");
const ghToken = process.env.GH_TOKEN;

const profile = await ensureProfile({
  root,
  username: config.githubUsername,
  regenerate: config.profile.regenerate,
  llm: { baseUrl: config.llm.baseUrl, apiKey, model: config.llm.model },
  ...(ghToken ? { ghToken } : {}),
  now,
});
```

(Move the `apiKey` / `ghToken` reads up so `ensureProfile` can use them; and remove the duplicate later in the file.)

Add the import: `import { ensureProfile } from "./pipeline/profile.js";` and remove the now-unused `import { parseProfile } from ...`.

- [ ] **Step 3: Add e2e regenerate case**

In `tests/e2e.test.ts`, add a third case:

```ts
it("auto-generates profile.yaml when regenerate is true and flips it back", async () => {
  await mkdir(path.join(tmpRoot, "config"), { recursive: true });
  await mkdir(path.join(tmpRoot, "data/issues"), { recursive: true });
  const cfg = cfgYaml.replace("regenerate: false", "regenerate: true");
  const fs = await import("node:fs/promises");
  await fs.writeFile(path.join(tmpRoot, "config/config.yaml"), cfg);
  // No profile.yaml on disk — ensureProfile must generate.
  const generatedProfile = JSON.stringify({
    themes: ["LLM tooling"],
    languages: ["rust"],
    exclude_themes: [],
    notes: "test",
  });

  let llmCalls = 0;
  const fetchMock = vi.fn(async (url: string | URL): Promise<Response> => {
    const u = String(url);
    if (u.includes("api.github.com/users/") && u.includes("/starred")) {
      return new Response(JSON.stringify([
        { full_name: "rust-lang/rust", description: "x", topics: ["rust"], language: "Rust" },
        { full_name: "tokio-rs/tokio", description: "y", topics: ["async"], language: "Rust" },
      ]));
    }
    if (u.includes("github.com/trending")) return new Response(trendingHtml);
    if (u.endsWith("/chat/completions")) {
      const idx = llmCalls++;
      // call 0 = profile gen, call 1 = rank, call 2+ = summarize
      const content = idx === 0 ? generatedProfile : (idx === 1 ? rankFixture : summaryFixture);
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    }
    throw new Error(`unexpected fetch ${u}`);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  process.env.LLM_API_KEY = "sk-test";
  await runPipeline({ root: tmpRoot, now: new Date("2026-05-04T00:00:00Z") });

  const profileText = await readFile(path.join(tmpRoot, "config/profile.yaml"), "utf8");
  expect(profileText).toContain("# generated 2026-05-04 from alice");
  expect(profileText).toContain("LLM tooling");

  const cfgAfter = await readFile(path.join(tmpRoot, "config/config.yaml"), "utf8");
  expect(cfgAfter).toContain("regenerate: false");
});
```

- [ ] **Step 4: Run full suite**

```bash
npm run typecheck && npm test
```

All green.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/profile.ts src/index.ts tests/e2e.test.ts
git commit -m "feat(profile): ensureProfile pre-step — auto-generate on first run / regenerate flag"
```

---

## Task 3: Workflow commit-back + docs

**Files:**
- Modify: `.github/workflows/daily.yml`
- Modify: `docs/setup.md`
- Modify: `config/config.yaml` (just comment)
- Modify: `README.md` and `README_EN.md` (one-line note about auto-gen)

The current commit-back step only stages `data/`. After M6 the pipeline may also write `config/profile.yaml` and `config/config.yaml` — both must be committed.

- [ ] **Step 1: Update commit-back step**

In `.github/workflows/daily.yml`, change:

```yaml
if git diff --quiet -- data/; then
  echo "no data/ changes to commit"
  exit 0
fi
git add data/
slug=$(git diff --staged --name-only -- data/issues/ | grep -oE '[0-9]{4}-W[0-9]{2}' | head -1)
slug=${slug:-untitled}
git commit -m "data: issue ${slug} [skip ci]"
git push
```

to:

```yaml
if git diff --quiet -- data/ config/; then
  echo "no data/ or config/ changes to commit"
  exit 0
fi
git add data/ config/profile.yaml config/config.yaml
slug=$(git diff --staged --name-only -- data/issues/ | grep -oE '[0-9]{4}-W[0-9]{2}' | head -1)
slug=${slug:-untitled}
git commit -m "data: issue ${slug} [skip ci]"
git push
```

- [ ] **Step 2: Update setup.md**

Replace the current step about "Optionally edit `config/profile.yaml`" with:

```markdown
> **Heads up:** if `config/profile.yaml` is missing on first run, octozine will auto-generate it from your last 100 starred repos and commit it back. To regenerate later (e.g., after your tastes shift), set `profile.regenerate: true` in `config/config.yaml`; the next run will rewrite the profile and flip the flag back.
```

- [ ] **Step 3: Update config.yaml comment**

Change:

```yaml
profile:
  regenerate: false             # true on next run = re-generate profile.yaml from starred
```

to:

```yaml
profile:
  # On first run with no profile.yaml present, octozine auto-generates one from your starred repos.
  # Set this to `true` to force a refresh on the next run; it will be flipped back automatically.
  regenerate: false
```

- [ ] **Step 4: Update READMEs**

In both `README.md` and `README_EN.md`, in the "Personalize your discoveries" section, add one line at the top:

```markdown
**On first run, octozine auto-generates this from your last 100 starred repos.** Edit it any time, or set `profile.regenerate: true` to refresh.
```

- [ ] **Step 5: Verify, commit, ship**

```bash
npm run typecheck && npm test
git add .github/workflows/daily.yml docs/setup.md config/config.yaml README.md README_EN.md
git commit -m "docs(m6): explain auto-generated profile + extend commit-back to config/"
```

---

## Self-Review

**Spec coverage check:**
- §9 trigger condition (missing OR regenerate=true) ✓
- §9 last 100 starred via REST ✓
- §9 single LLM call → profile.yaml with `# generated YYYY-MM-DD` header ✓
- §9 commit back ✓
- §9 flip regenerate=true back to false ✓ (string-level so comments survive)

**Placeholder scan:** none.

**Type consistency:** `Profile` exported from `types.ts` is the canonical shape; `ProfileGenSchema` is the LLM-output snake_case shape, immediately mapped to camelCase `Profile`.

**Ambiguity check resolved:**
- "Last 100 starred": one page of `?per_page=100`, sorted by GitHub's default (created_at desc).
- Empty starred: throws — no fallback. Per `no-fallback` rule, surface the problem clearly to the user.
- LLM JSON output validation: zod parse; on failure, retry once then abort.
- Comments preservation: string-level regex flip-back, not yaml.dump round-trip.
