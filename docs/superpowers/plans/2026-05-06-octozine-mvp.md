# Octozine MVP Implementation Plan (M1–M3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core Octozine pipeline: fetch GitHub trending → LLM rank → LLM bilingual summary → render to a magazine-style Astro static site. After M1–M3, running `npm run pipeline && cd web && npm run dev` locally produces a working issue at `localhost:4321` matching the v3 visual spec.

**Architecture:** Single TypeScript + Node.js stack. Pipeline lives in `src/`, frontend in `web/` (Astro). Each pipeline step is a pure async function with fixture-driven Vitest tests. LLM is abstracted behind a single OpenAI-compatible adapter. Issue data flows through the pipeline, gets serialized to `data/issues/<slug>.json`, then Astro reads the latest JSON at build time.

**Tech Stack:** TypeScript 5.4+, Node.js 20+, Astro 4.x, Vitest 1.x, Cheerio 1.x (HTML parsing), Zod 3.x (schema validation), js-yaml 4.x (config).

**Reference:** See `docs/superpowers/specs/2026-05-06-octozine-design.md` for full design.

---

## Scope of this plan

Covers spec milestones **M1–M3**:
- **M1** · scaffold: project structure, single `trending` fetcher, minimal pipeline, Issue JSON output
- **M2** · LLM: OpenAI-compatible adapter, rank, summarize, dedup
- **M3** · Astro: magazine-style static site (v3 visual spec), `index` + `archive/[slug]` pages

**Out of scope** (later plans):
- Other fetchers: search / hn / events (M4)
- GitHub Actions / Pages deploy (M5)
- Profile auto-generation from starred repos (M6 — for now profile.yaml is hand-edited)
- Telegram / email / RSS push (M7)
- README and promo materials (M8)

---

## File map (created or modified in this plan)

| File | Purpose |
|---|---|
| `package.json` | Root npm config, scripts, deps |
| `tsconfig.json` | TypeScript strict config |
| `vitest.config.ts` | Vitest config |
| `.editorconfig` | Editor settings |
| `.gitignore` | (already exists; will append) |
| `src/types.ts` | Shared types: `Candidate`, `RankedCandidate`, `SummarizedItem`, `IssueData`, `Profile`, `Config`, `Source` |
| `src/config.ts` | Load and validate `config/config.yaml` and `config/profile.yaml` via Zod |
| `src/fetchers/trending.ts` | Fetch & parse `github.com/trending` HTML into `Candidate[]` |
| `src/llm/openai-compatible.ts` | Single `chat()` function |
| `src/pipeline/dedup.ts` | Cross-source dedup; merges `sources[]` and `sourceMeta` |
| `src/pipeline/rank.ts` | One LLM call ranks candidates against profile; returns top N with `score` + `reason` |
| `src/pipeline/summarize.ts` | LLM bilingual summary per item; concurrent with limit |
| `src/render/build-issue.ts` | Assemble `IssueData` from ranked + summarized items; ISO-week slug |
| `src/index.ts` | Pipeline entry: load config → fetch → dedup → rank → summarize → write JSON |
| `config/config.yaml` | Sample runtime config |
| `config/profile.yaml` | Sample static profile (M1–M3); auto-gen comes in M6 |
| `data/issues/.gitkeep` | Output dir (issues land here) |
| `tests/fixtures/trending.html` | Recorded `github.com/trending` HTML for tests |
| `tests/fixtures/llm-rank.json` | Mocked LLM rank response |
| `tests/fixtures/llm-summarize.json` | Mocked LLM summarize response |
| `tests/fetchers/trending.test.ts` | parse + fetch (mocked) |
| `tests/llm/openai-compatible.test.ts` | request shape + error handling |
| `tests/pipeline/dedup.test.ts` | merge sources, dedup |
| `tests/pipeline/rank.test.ts` | top-N + score order |
| `tests/pipeline/summarize.test.ts` | per-item summary + concurrency |
| `tests/render/build-issue.test.ts` | hero/items split, ISO-week slug, sourceCounts |
| `tests/e2e.test.ts` | end-to-end with mocked fetch + LLM |
| `web/package.json` | Astro project deps |
| `web/astro.config.mjs` | Astro config |
| `web/tsconfig.json` | Astro TS config |
| `web/src/styles/global.css` | Magazine v3 styles (port of `elegant-v3.html`) |
| `web/src/lib/issues.ts` | Read issue JSONs from `../data/issues/` |
| `web/src/components/Header.astro` | Brand header |
| `web/src/components/Hero.astro` | Featured project block |
| `web/src/components/Item.astro` | Numbered list item |
| `web/src/pages/index.astro` | Latest issue (homepage) |
| `web/src/pages/archive/[slug].astro` | Archive issue page |

---

## Conventions used in this plan

- **TDD discipline**: write failing test → confirm fail → implement → confirm pass → commit. For non-logic tasks (scaffolding, CSS), tests are skipped and noted explicitly.
- **Commit messages**: Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`).
- **Imports**: ESM with `.js` extension on relative imports (TypeScript ESM convention).
- **Strict mode**: `"strict": true` in tsconfig. No `any` without comment.
- **Test runner**: `npm test` runs Vitest. Single test file: `npm test -- tests/path/file.test.ts`.

---

## Task 0: Initialize project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.editorconfig`
- Modify: `.gitignore` (already exists)

- [ ] **Step 0.1: Write `package.json`**

`package.json`:
```json
{
  "name": "octozine",
  "version": "0.1.0",
  "description": "A folio of GitHub, curated weekly.",
  "type": "module",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "pipeline": "node --import tsx/esm src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "js-yaml": "^4.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.12.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 0.2: Write `tsconfig.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*", "tests/**/*", "vitest.config.ts"],
  "exclude": ["node_modules", "web", "dist"]
}
```

- [ ] **Step 0.3: Write `vitest.config.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 0.4: Write `.editorconfig`**

`.editorconfig`:
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 0.5: Append to `.gitignore`**

`.gitignore` (full content after this step):
```
.superpowers/
node_modules/
dist/
.env
.env.*
*.log
.DS_Store
tmp-e2e/
web/.astro/
web/dist/
```

(Note: `data/issues/*.json` is intentionally NOT ignored — issues are committed as part of the project history per spec §13.)

- [ ] **Step 0.6: Install deps and verify**

```bash
npm install
npx tsc --noEmit
npx vitest run --passWithNoTests
```
Expected: `npm install` completes; `tsc` exits 0 (no source files yet); `vitest` reports `No test files found, exiting with code 0`.

- [ ] **Step 0.7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .editorconfig .gitignore
git commit -m "chore: scaffold node + ts + vitest project"
```

---

## Task 1: Shared types `src/types.ts`

**Files:**
- Create: `src/types.ts`

This task has no separate test — types are checked by `tsc` and used implicitly by every later task.

- [ ] **Step 1.1: Write `src/types.ts`**

`src/types.ts`:
```ts
export type Source = "trending" | "search" | "hn" | "events";

export type Candidate = {
  owner: string;
  repo: string;
  description: string;
  stars: number;
  starsDelta?: number;
  language?: string;
  topics: string[];
  url: string;
  sources: Source[];
  sourceMeta: Partial<Record<Source, Record<string, unknown>>>;
};

export type RankedCandidate = Candidate & {
  score: number;   // 0-100
  reason: string;  // single zh sentence explaining why it ranks here
};

export type Summary = { zh: string; en: string };

export type SummarizedItem = RankedCandidate & {
  summary: Summary;
};

export type Profile = {
  themes: string[];
  languages: string[];
  excludeThemes: string[];
  notes: string;
};

export type Config = {
  schedule: string;            // "weekly" | "daily" | cron expression
  languages: ("zh" | "en")[];
  githubUsername: string;
  profile: { regenerate: boolean };
  llm: { baseUrl: string; model: string };
  sources: {
    trending: { enabled: boolean; langs: string[]; window: "daily" | "weekly" | "monthly" };
    search?: { enabled: boolean; queries: string[] };
    hn?: { enabled: boolean; minScore: number };
    events?: { enabled: boolean };
  };
  outputs: {
    pages: { enabled: boolean };
    rss?: { enabled: boolean };
    telegram?: { enabled: boolean; chatId: string };
    email?: { enabled: boolean; to: string };
  };
  topN: number;
  heroN: number;
  historyWindow: number;
};

export type IssueData = {
  slug: string;            // e.g. "2026-W18"
  generatedAt: string;     // ISO 8601
  hero: SummarizedItem;
  items: SummarizedItem[]; // excluding hero
  meta: {
    config: { schedule: string; languages: ("zh" | "en")[] };
    profile: Profile;
    sourceCounts: Partial<Record<Source, number>>;
  };
};
```

- [ ] **Step 1.2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 1.3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): define shared pipeline types"
```

---

## Task 2: Config loader `src/config.ts`

**Files:**
- Create: `src/config.ts`, `tests/config.test.ts`, `config/config.yaml`, `config/profile.yaml`

- [ ] **Step 2.1: Write the failing test**

`tests/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseConfig, parseProfile } from "../src/config.js";

describe("parseConfig", () => {
  it("accepts a minimal valid config", () => {
    const yaml = `
schedule: weekly
languages: [zh, en]
github_username: alice
profile:
  regenerate: false
llm:
  base_url: https://api.deepseek.com
  model: deepseek-chat
sources:
  trending:
    enabled: true
    langs: [rust, python]
    window: weekly
outputs:
  pages: { enabled: true }
top_n: 5
hero_n: 1
history_window: 4
`;
    const cfg = parseConfig(yaml);
    expect(cfg.schedule).toBe("weekly");
    expect(cfg.githubUsername).toBe("alice");
    expect(cfg.sources.trending.langs).toEqual(["rust", "python"]);
    expect(cfg.topN).toBe(5);
  });

  it("rejects missing required fields", () => {
    const yaml = `schedule: weekly\n`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  it("rejects invalid window values", () => {
    const yaml = `
schedule: weekly
languages: [en]
github_username: bob
profile: { regenerate: false }
llm: { base_url: https://x.y, model: m }
sources:
  trending: { enabled: true, langs: [], window: hourly }
outputs:
  pages: { enabled: true }
top_n: 5
hero_n: 1
history_window: 4
`;
    expect(() => parseConfig(yaml)).toThrow();
  });
});

describe("parseProfile", () => {
  it("accepts a minimal profile", () => {
    const yaml = `
themes: ["LLM tooling"]
languages: [rust]
exclude_themes: ["web3"]
notes: |
  prefers low-level work
`;
    const p = parseProfile(yaml);
    expect(p.themes).toEqual(["LLM tooling"]);
    expect(p.notes.trim()).toBe("prefers low-level work");
  });
});
```

- [ ] **Step 2.2: Run test, expect failure**

```bash
npm test -- tests/config.test.ts
```
Expected: FAIL — `Cannot find module '../src/config.js'` or similar.

- [ ] **Step 2.3: Implement `src/config.ts`**

`src/config.ts`:
```ts
import { z } from "zod";
import yaml from "js-yaml";
import type { Config, Profile } from "./types.js";

const SourcesSchema = z.object({
  trending: z.object({
    enabled: z.boolean(),
    langs: z.array(z.string()),
    window: z.enum(["daily", "weekly", "monthly"]),
  }),
  search: z.object({
    enabled: z.boolean(),
    queries: z.array(z.string()),
  }).optional(),
  hn: z.object({
    enabled: z.boolean(),
    min_score: z.number(),
  }).optional(),
  events: z.object({
    enabled: z.boolean(),
  }).optional(),
});

const OutputsSchema = z.object({
  pages: z.object({ enabled: z.boolean() }),
  rss: z.object({ enabled: z.boolean() }).optional(),
  telegram: z.object({ enabled: z.boolean(), chat_id: z.string() }).optional(),
  email: z.object({ enabled: z.boolean(), to: z.string() }).optional(),
});

const ConfigSchema = z.object({
  schedule: z.string(),
  languages: z.array(z.enum(["zh", "en"])).min(1),
  github_username: z.string().min(1),
  profile: z.object({ regenerate: z.boolean() }),
  llm: z.object({ base_url: z.string().url(), model: z.string().min(1) }),
  sources: SourcesSchema,
  outputs: OutputsSchema,
  top_n: z.number().int().positive(),
  hero_n: z.number().int().positive(),
  history_window: z.number().int().nonnegative(),
});

const ProfileSchema = z.object({
  themes: z.array(z.string()),
  languages: z.array(z.string()),
  exclude_themes: z.array(z.string()),
  notes: z.string(),
});

export function parseConfig(text: string): Config {
  const raw = yaml.load(text);
  const parsed = ConfigSchema.parse(raw);
  return {
    schedule: parsed.schedule,
    languages: parsed.languages,
    githubUsername: parsed.github_username,
    profile: parsed.profile,
    llm: { baseUrl: parsed.llm.base_url, model: parsed.llm.model },
    sources: {
      trending: parsed.sources.trending,
      ...(parsed.sources.search ? { search: parsed.sources.search } : {}),
      ...(parsed.sources.hn ? { hn: { enabled: parsed.sources.hn.enabled, minScore: parsed.sources.hn.min_score } } : {}),
      ...(parsed.sources.events ? { events: parsed.sources.events } : {}),
    },
    outputs: {
      pages: parsed.outputs.pages,
      ...(parsed.outputs.rss ? { rss: parsed.outputs.rss } : {}),
      ...(parsed.outputs.telegram ? { telegram: { enabled: parsed.outputs.telegram.enabled, chatId: parsed.outputs.telegram.chat_id } } : {}),
      ...(parsed.outputs.email ? { email: parsed.outputs.email } : {}),
    },
    topN: parsed.top_n,
    heroN: parsed.hero_n,
    historyWindow: parsed.history_window,
  };
}

export function parseProfile(text: string): Profile {
  const raw = yaml.load(text);
  const parsed = ProfileSchema.parse(raw);
  return {
    themes: parsed.themes,
    languages: parsed.languages,
    excludeThemes: parsed.exclude_themes,
    notes: parsed.notes,
  };
}
```

- [ ] **Step 2.4: Re-run test, expect pass**

```bash
npm test -- tests/config.test.ts
```
Expected: PASS — 4 tests pass.

- [ ] **Step 2.5: Write sample `config/config.yaml`**

`config/config.yaml`:
```yaml
# Octozine config — change values below to make this fork yours.

schedule: weekly                # weekly | daily | "0 9 * * 1" cron
languages: [zh, en]
github_username: yourname

profile:
  regenerate: false             # true on next run = re-generate profile.yaml from starred

llm:
  base_url: https://api.deepseek.com
  model: deepseek-chat
  # API key goes in GitHub Secrets as LLM_API_KEY

sources:
  trending:
    enabled: true
    langs: [rust, python, typescript, go]
    window: weekly
  # search / hn / events come in M4

outputs:
  pages: { enabled: true }

top_n: 5
hero_n: 1
history_window: 4               # number of past issues whose repos are excluded from this run
```

- [ ] **Step 2.6: Write sample `config/profile.yaml`**

`config/profile.yaml`:
```yaml
# Hand-edit freely. M6 will add auto-generation from your starred repos.
themes:
  - "LLM tooling and inference engines"
  - "Terminal UI / developer tools"
  - "Rust systems programming"
languages: [rust, python, go, typescript]
exclude_themes:
  - "blockchain / web3"
  - "marketing / SEO tools"
notes: |
  Prefers low-level, performance-sensitive, developer-focused projects.
  Not interested in SaaS or marketing tooling.
```

- [ ] **Step 2.7: Commit**

```bash
git add src/config.ts tests/config.test.ts config/config.yaml config/profile.yaml
git commit -m "feat(config): yaml config + profile parsers with zod validation"
```

---

## Task 3: GitHub trending fetcher `src/fetchers/trending.ts`

**Files:**
- Create: `src/fetchers/trending.ts`, `tests/fetchers/trending.test.ts`, `tests/fixtures/trending.html`

- [ ] **Step 3.1: Capture a real trending fixture**

```bash
mkdir -p tests/fixtures
curl -sL "https://github.com/trending/rust?since=weekly" -o tests/fixtures/trending.html
```

Verify the file is non-empty and contains `class="Box-row"`:
```bash
grep -c "Box-row" tests/fixtures/trending.html
```
Expected: a positive integer (typically 25).

- [ ] **Step 3.2: Write the failing test**

`tests/fetchers/trending.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseTrending } from "../../src/fetchers/trending.js";

describe("parseTrending", () => {
  it("extracts repos from real trending html", async () => {
    const html = await readFile(new URL("../fixtures/trending.html", import.meta.url), "utf8");
    const items = parseTrending(html);
    expect(items.length).toBeGreaterThan(0);
    const first = items[0];
    expect(first).toBeDefined();
    expect(first!.owner.length).toBeGreaterThan(0);
    expect(first!.repo.length).toBeGreaterThan(0);
    expect(first!.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    expect(first!.stars).toBeGreaterThanOrEqual(0);
    expect(first!.sources).toEqual(["trending"]);
  });

  it("returns empty array on empty html", () => {
    expect(parseTrending("<html></html>")).toEqual([]);
  });
});
```

- [ ] **Step 3.3: Run test, expect failure**

```bash
npm test -- tests/fetchers/trending.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3.4: Implement `src/fetchers/trending.ts`**

`src/fetchers/trending.ts`:
```ts
import * as cheerio from "cheerio";
import type { Candidate, Source } from "../types.js";

export type TrendingOpts = {
  langs: string[];                                    // empty = all-language page
  window: "daily" | "weekly" | "monthly";
};

const BASE = "https://github.com/trending";

export async function fetchTrending(opts: TrendingOpts): Promise<Candidate[]> {
  const langs = opts.langs.length > 0 ? opts.langs : [""];
  const all: Candidate[] = [];
  for (const lang of langs) {
    const url = `${BASE}${lang ? "/" + encodeURIComponent(lang) : ""}?since=${opts.window}`;
    const res = await fetch(url, { headers: { "User-Agent": "octozine/0.1" } });
    if (!res.ok) {
      throw new Error(`trending fetch failed for ${lang || "all"}: HTTP ${res.status}`);
    }
    const html = await res.text();
    all.push(...parseTrending(html, opts.window));
  }
  return all;
}

export function parseTrending(html: string, window: string = "weekly"): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  $("article.Box-row").each((_, el) => {
    const a = $(el).find("h2 a");
    const href = (a.attr("href") ?? "").trim().replace(/^\//, "");
    const [owner, repo] = href.split("/");
    if (!owner || !repo) return;
    const description = $(el).find("p").text().trim();
    const language = $(el).find("[itemprop='programmingLanguage']").text().trim() || undefined;
    const stargazers = $(el).find("a[href$='/stargazers']").text().trim();
    const stars = parseInt(stargazers.replace(/,/g, ""), 10) || 0;
    const deltaText = $(el).find(".d-inline-block.float-sm-right").text().trim();
    const deltaMatch = deltaText.match(/([\d,]+)/);
    const starsDelta = deltaMatch && deltaMatch[1] ? parseInt(deltaMatch[1].replace(/,/g, ""), 10) : undefined;
    const item: Candidate = {
      owner,
      repo,
      description,
      stars,
      ...(starsDelta !== undefined ? { starsDelta } : {}),
      ...(language ? { language } : {}),
      topics: [],
      url: `https://github.com/${owner}/${repo}`,
      sources: ["trending" as Source],
      sourceMeta: { trending: { window } },
    };
    out.push(item);
  });
  return out;
}
```

- [ ] **Step 3.5: Re-run test, expect pass**

```bash
npm test -- tests/fetchers/trending.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 3.6: Commit**

```bash
git add src/fetchers/trending.ts tests/fetchers/trending.test.ts tests/fixtures/trending.html
git commit -m "feat(fetchers): scrape and parse github trending"
```

---

## Task 4: LLM adapter `src/llm/openai-compatible.ts`

**Files:**
- Create: `src/llm/openai-compatible.ts`, `tests/llm/openai-compatible.test.ts`

- [ ] **Step 4.1: Write the failing test**

`tests/llm/openai-compatible.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chat } from "../../src/llm/openai-compatible.js";

describe("chat()", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("posts a properly shaped request and returns content", async () => {
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-xyz");
      expect(headers.get("content-type")).toBe("application/json");
      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe("deepseek-chat");
      expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
      expect(body.response_format).toEqual({ type: "json_object" });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
    });
    globalThis.fetch = mock as unknown as typeof fetch;

    const out = await chat({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-xyz",
      model: "deepseek-chat",
      messages: [{ role: "user", content: "ping" }],
      responseFormat: "json",
    });
    expect(out).toBe("{\"ok\":true}");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("strips trailing slash on baseUrl", async () => {
    const mock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    await chat({
      baseUrl: "https://api.openai.com/v1/",
      apiKey: "k",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "x" }],
    });
  });

  it("throws on non-2xx response", async () => {
    globalThis.fetch = (async () => new Response("rate limit", { status: 429 })) as typeof fetch;
    await expect(chat({
      baseUrl: "https://x", apiKey: "k", model: "m", messages: [{ role: "user", content: "y" }],
    })).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 4.2: Run test, expect failure**

```bash
npm test -- tests/llm/openai-compatible.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement `src/llm/openai-compatible.ts`**

`src/llm/openai-compatible.ts`:
```ts
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "json" | "text";
};

export async function chat(opts: ChatOpts): Promise<string> {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`LLM response missing content: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return content;
}
```

- [ ] **Step 4.4: Re-run test, expect pass**

```bash
npm test -- tests/llm/openai-compatible.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 4.5: Commit**

```bash
git add src/llm/openai-compatible.ts tests/llm/openai-compatible.test.ts
git commit -m "feat(llm): openai-compatible chat adapter"
```

---

## Task 5: Dedup `src/pipeline/dedup.ts`

**Files:**
- Create: `src/pipeline/dedup.ts`, `tests/pipeline/dedup.test.ts`

- [ ] **Step 5.1: Write the failing test**

`tests/pipeline/dedup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dedupCandidates } from "../../src/pipeline/dedup.js";
import type { Candidate } from "../../src/types.js";

function mk(owner: string, repo: string, source: Candidate["sources"][number], extra: Partial<Candidate> = {}): Candidate {
  return {
    owner, repo,
    description: "",
    stars: 0,
    topics: [],
    url: `https://github.com/${owner}/${repo}`,
    sources: [source],
    sourceMeta: { [source]: {} },
    ...extra,
  };
}

describe("dedupCandidates", () => {
  it("merges sources for the same owner/repo", () => {
    const a = mk("rust-lang", "rust", "trending", { description: "", sourceMeta: { trending: { window: "weekly" } } });
    const b = mk("rust-lang", "rust", "hn", { description: "Empowering everyone to build reliable and efficient software.", sourceMeta: { hn: { score: 320 } } });
    const out = dedupCandidates([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sources.sort()).toEqual(["hn", "trending"]);
    expect(out[0]!.sourceMeta).toMatchObject({ trending: { window: "weekly" }, hn: { score: 320 } });
    expect(out[0]!.description).toBe("Empowering everyone to build reliable and efficient software.");
  });

  it("treats different repos as different items", () => {
    const out = dedupCandidates([mk("a", "x", "trending"), mk("b", "y", "trending")]);
    expect(out).toHaveLength(2);
  });

  it("is case-insensitive on owner/repo key", () => {
    const out = dedupCandidates([mk("Rust-Lang", "Rust", "trending"), mk("rust-lang", "rust", "hn")]);
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 5.2: Run test, expect failure**

```bash
npm test -- tests/pipeline/dedup.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `src/pipeline/dedup.ts`**

`src/pipeline/dedup.ts`:
```ts
import type { Candidate } from "../types.js";

export function dedupCandidates(items: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const c of items) {
    const key = `${c.owner}/${c.repo}`.toLowerCase();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...c, sources: [...c.sources], sourceMeta: { ...c.sourceMeta }, topics: [...c.topics] });
      continue;
    }
    const sources = Array.from(new Set([...prev.sources, ...c.sources]));
    const sourceMeta = { ...prev.sourceMeta, ...c.sourceMeta };
    const description = prev.description.length >= c.description.length ? prev.description : c.description;
    const stars = Math.max(prev.stars, c.stars);
    const starsDelta = Math.max(prev.starsDelta ?? 0, c.starsDelta ?? 0) || prev.starsDelta || c.starsDelta;
    const language = prev.language ?? c.language;
    const topics = Array.from(new Set([...prev.topics, ...c.topics]));
    const merged: Candidate = {
      owner: prev.owner,
      repo: prev.repo,
      description,
      stars,
      topics,
      url: prev.url,
      sources,
      sourceMeta,
      ...(starsDelta !== undefined ? { starsDelta } : {}),
      ...(language ? { language } : {}),
    };
    map.set(key, merged);
  }
  return Array.from(map.values());
}
```

- [ ] **Step 5.4: Re-run test, expect pass**

```bash
npm test -- tests/pipeline/dedup.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 5.5: Commit**

```bash
git add src/pipeline/dedup.ts tests/pipeline/dedup.test.ts
git commit -m "feat(pipeline): cross-source dedup with metadata merge"
```

---

## Task 6: Rank `src/pipeline/rank.ts`

**Files:**
- Create: `src/pipeline/rank.ts`, `tests/pipeline/rank.test.ts`, `tests/fixtures/llm-rank.json`

- [ ] **Step 6.1: Write the LLM rank fixture**

`tests/fixtures/llm-rank.json`:
```json
{
  "ranking": [
    { "i": 0, "score": 92, "reason": "Rust 系统编程，命中 themes 中的 Rust 偏好。" },
    { "i": 2, "score": 85, "reason": "终端 TUI 工具，命中 themes。" },
    { "i": 1, "score": 40, "reason": "前端框架，与 exclude 相关性较低。" }
  ]
}
```

- [ ] **Step 6.2: Write the failing test**

`tests/pipeline/rank.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { rankCandidates } from "../../src/pipeline/rank.js";
import type { Candidate, Profile } from "../../src/types.js";

const profile: Profile = {
  themes: ["Rust 系统编程", "终端 TUI"],
  languages: ["rust"],
  excludeThemes: ["前端 UI 框架"],
  notes: "low-level, performance",
};

const candidates: Candidate[] = [
  { owner: "rust-lang", repo: "rust", description: "Rust language", stars: 90000, topics: [], url: "https://github.com/rust-lang/rust", sources: ["trending"], sourceMeta: {} },
  { owner: "vercel", repo: "next.js", description: "React framework", stars: 100000, topics: [], url: "https://github.com/vercel/next.js", sources: ["trending"], sourceMeta: {} },
  { owner: "ratatui-org", repo: "ratatui", description: "Rust TUI library", stars: 12000, topics: [], url: "https://github.com/ratatui-org/ratatui", sources: ["trending"], sourceMeta: {} },
];

afterEach(() => { vi.restoreAllMocks(); });

describe("rankCandidates", () => {
  it("returns top N sorted by score, attaching score+reason", async () => {
    const fixture = await readFile(new URL("../fixtures/llm-rank.json", import.meta.url), "utf8");
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: fixture } }],
    }))) as typeof fetch;
    const out = await rankCandidates(candidates, profile, 2, {
      baseUrl: "https://x", apiKey: "k", model: "m",
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.owner).toBe("rust-lang");
    expect(out[0]!.score).toBe(92);
    expect(out[0]!.reason).toContain("Rust");
    expect(out[1]!.owner).toBe("ratatui-org");
    expect(out[1]!.score).toBe(85);
  });

  it("propagates fetch errors", async () => {
    globalThis.fetch = (async () => new Response("err", { status: 500 })) as typeof fetch;
    await expect(rankCandidates(candidates, profile, 2, { baseUrl: "https://x", apiKey: "k", model: "m" })).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 6.3: Run test, expect failure**

```bash
npm test -- tests/pipeline/rank.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 6.4: Implement `src/pipeline/rank.ts`**

`src/pipeline/rank.ts`:
```ts
import type { Candidate, RankedCandidate, Profile } from "../types.js";
import { chat } from "../llm/openai-compatible.js";

export type RankLLMOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const SYSTEM_PROMPT = `You are a curator who ranks GitHub projects by how well each matches a user's interests.
Output strict JSON: { "ranking": [ { "i": <integer index>, "score": <0-100 integer>, "reason": "<one Chinese sentence>" } ] }
Rank EVERY item exactly once. Higher score means stronger match. The reason explains the match in one Chinese sentence (≤ 60 chars).`;

export async function rankCandidates(
  candidates: Candidate[],
  profile: Profile,
  topN: number,
  llm: RankLLMOpts,
): Promise<RankedCandidate[]> {
  if (candidates.length === 0) return [];
  const items = candidates.map((c, i) => ({
    i,
    name: `${c.owner}/${c.repo}`,
    description: c.description,
    language: c.language ?? null,
    stars: c.stars,
    starsDelta: c.starsDelta ?? null,
    sources: c.sources,
  }));
  const user = [
    "# user profile",
    `themes: ${JSON.stringify(profile.themes)}`,
    `languages: ${JSON.stringify(profile.languages)}`,
    `exclude_themes: ${JSON.stringify(profile.excludeThemes)}`,
    `notes: ${profile.notes}`,
    "",
    "# candidates",
    items.map(it => JSON.stringify(it)).join("\n"),
  ].join("\n");

  const text = await chat({
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    responseFormat: "json",
  });

  const parsed = JSON.parse(text) as { ranking: Array<{ i: number; score: number; reason: string }> };
  if (!Array.isArray(parsed.ranking)) {
    throw new Error("rank: LLM returned no ranking[]");
  }
  parsed.ranking.sort((a, b) => b.score - a.score);

  const result: RankedCandidate[] = [];
  for (const r of parsed.ranking) {
    if (result.length >= topN) break;
    const c = candidates[r.i];
    if (!c) continue;
    result.push({ ...c, score: r.score, reason: r.reason });
  }
  return result;
}
```

- [ ] **Step 6.5: Re-run test, expect pass**

```bash
npm test -- tests/pipeline/rank.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 6.6: Commit**

```bash
git add src/pipeline/rank.ts tests/pipeline/rank.test.ts tests/fixtures/llm-rank.json
git commit -m "feat(pipeline): llm rank with profile-aware scoring"
```

---

## Task 7: Summarize `src/pipeline/summarize.ts`

**Files:**
- Create: `src/pipeline/summarize.ts`, `tests/pipeline/summarize.test.ts`, `tests/fixtures/llm-summarize.json`

- [ ] **Step 7.1: Write the LLM summary fixture**

`tests/fixtures/llm-summarize.json`:
```json
{
  "zh": "用 Rust 写的终端 UI 库，被 gitui、atuin、helix 等新一代终端应用作为基础。",
  "en": "A Rust library for building rich terminal UIs. It powers a growing wave of TUI tools including gitui, atuin, and helix."
}
```

- [ ] **Step 7.2: Write the failing test**

`tests/pipeline/summarize.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { summarizeOne, summarizeAll } from "../../src/pipeline/summarize.js";
import type { RankedCandidate } from "../../src/types.js";

const item: RankedCandidate = {
  owner: "ratatui-org",
  repo: "ratatui",
  description: "Rust TUI library",
  stars: 12000,
  topics: ["tui", "rust"],
  url: "https://github.com/ratatui-org/ratatui",
  sources: ["trending"],
  sourceMeta: {},
  language: "rust",
  score: 90,
  reason: "Rust TUI",
};

afterEach(() => { vi.restoreAllMocks(); });

describe("summarizeOne", () => {
  it("returns bilingual summary", async () => {
    const fixture = await readFile(new URL("../fixtures/llm-summarize.json", import.meta.url), "utf8");
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: fixture } }],
    }))) as typeof fetch;
    const s = await summarizeOne(item, { baseUrl: "https://x", apiKey: "k", model: "m" });
    expect(s.summary.zh).toContain("Rust");
    expect(s.summary.en).toMatch(/Rust|TUI/);
    expect(s.owner).toBe("ratatui-org");
    expect(s.score).toBe(90);
  });
});

describe("summarizeAll", () => {
  it("respects concurrency and preserves order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = (async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ zh: "z", en: "e" }) } }],
      }));
    }) as typeof fetch;
    const items = Array.from({ length: 5 }, (_, k) => ({ ...item, repo: `r${k}` }));
    const out = await summarizeAll(items, { baseUrl: "https://x", apiKey: "k", model: "m" }, 2);
    expect(out).toHaveLength(5);
    expect(out.map(o => o.repo)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 7.3: Run test, expect failure**

```bash
npm test -- tests/pipeline/summarize.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 7.4: Implement `src/pipeline/summarize.ts`**

`src/pipeline/summarize.ts`:
```ts
import type { RankedCandidate, SummarizedItem, Summary } from "../types.js";
import { chat } from "../llm/openai-compatible.js";

export type SummarizeLLMOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const SYSTEM_PROMPT = `Generate a bilingual (zh-CN + en) summary of a GitHub project.
Each language: 50–80 characters (zh) or 50–80 words (en), one paragraph, no bullets, no markdown.
Cover: what the project does, key comparison or replacement (if any), and one notable feature.
Output strict JSON: { "zh": "<sentence>", "en": "<sentence>" }`;

export async function summarizeOne(c: RankedCandidate, llm: SummarizeLLMOpts): Promise<SummarizedItem> {
  const user = [
    `name: ${c.owner}/${c.repo}`,
    `description: ${c.description || "(no description)"}`,
    `language: ${c.language ?? "unknown"}`,
    `topics: ${c.topics.join(", ") || "(none)"}`,
    `stars: ${c.stars}`,
  ].join("\n");
  const text = await chat({
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    responseFormat: "json",
  });
  const summary = JSON.parse(text) as Summary;
  if (typeof summary.zh !== "string" || typeof summary.en !== "string") {
    throw new Error(`summarize: invalid response shape: ${text.slice(0, 200)}`);
  }
  return { ...c, summary };
}

export async function summarizeAll(
  items: RankedCandidate[],
  llm: SummarizeLLMOpts,
  concurrency = 3,
): Promise<SummarizedItem[]> {
  const out: SummarizedItem[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await summarizeOneWithRetry(items[idx]!, llm);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return out;
}

async function summarizeOneWithRetry(c: RankedCandidate, llm: SummarizeLLMOpts): Promise<SummarizedItem> {
  try {
    return await summarizeOne(c, llm);
  } catch (e) {
    return await summarizeOne(c, llm);  // single retry, then bubble
  }
}
```

- [ ] **Step 7.5: Re-run test, expect pass**

```bash
npm test -- tests/pipeline/summarize.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 7.6: Commit**

```bash
git add src/pipeline/summarize.ts tests/pipeline/summarize.test.ts tests/fixtures/llm-summarize.json
git commit -m "feat(pipeline): bilingual llm summary with concurrency limit"
```

---

## Task 8: Build issue `src/render/build-issue.ts`

**Files:**
- Create: `src/render/build-issue.ts`, `tests/render/build-issue.test.ts`

- [ ] **Step 8.1: Write the failing test**

`tests/render/build-issue.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildIssue, slugForDate } from "../../src/render/build-issue.js";
import type { SummarizedItem, Profile, Config } from "../../src/types.js";

const profile: Profile = { themes: [], languages: [], excludeThemes: [], notes: "" };

const cfg: Config = {
  schedule: "weekly",
  languages: ["zh", "en"],
  githubUsername: "alice",
  profile: { regenerate: false },
  llm: { baseUrl: "https://x", model: "m" },
  sources: { trending: { enabled: true, langs: [], window: "weekly" } },
  outputs: { pages: { enabled: true } },
  topN: 5,
  heroN: 1,
  historyWindow: 4,
};

function mk(repo: string, sources: SummarizedItem["sources"]): SummarizedItem {
  return {
    owner: "x", repo,
    description: "", stars: 0, topics: [],
    url: `https://github.com/x/${repo}`,
    sources, sourceMeta: {},
    score: 90, reason: "r",
    summary: { zh: "z", en: "e" },
  };
}

describe("slugForDate", () => {
  it("formats ISO week", () => {
    // 2026-05-04 is a Monday, ISO week 19
    expect(slugForDate(new Date("2026-05-04T00:00:00Z"))).toBe("2026-W19");
  });
});

describe("buildIssue", () => {
  it("splits hero from items and counts sources", () => {
    const items = [
      mk("a", ["trending", "hn"]),
      mk("b", ["trending"]),
      mk("c", ["hn"]),
    ];
    const issue = buildIssue({
      config: cfg, profile, items, generatedAt: new Date("2026-05-04T00:00:00Z"),
    });
    expect(issue.slug).toBe("2026-W19");
    expect(issue.hero.repo).toBe("a");
    expect(issue.items.map(i => i.repo)).toEqual(["b", "c"]);
    expect(issue.meta.sourceCounts).toEqual({ trending: 2, hn: 2 });
    expect(issue.meta.config.languages).toEqual(["zh", "en"]);
  });

  it("throws on empty items", () => {
    expect(() => buildIssue({ config: cfg, profile, items: [], generatedAt: new Date() })).toThrow();
  });
});
```

- [ ] **Step 8.2: Run test, expect failure**

```bash
npm test -- tests/render/build-issue.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 8.3: Implement `src/render/build-issue.ts`**

`src/render/build-issue.ts`:
```ts
import type { IssueData, SummarizedItem, Profile, Config, Source } from "../types.js";

export type BuildOpts = {
  config: Config;
  profile: Profile;
  items: SummarizedItem[];
  generatedAt?: Date;
};

export function buildIssue(opts: BuildOpts): IssueData {
  if (opts.items.length === 0) {
    throw new Error("buildIssue: empty items list");
  }
  if (opts.config.heroN !== 1) {
    console.warn(`buildIssue: heroN=${opts.config.heroN} not yet supported; using 1`);
  }
  const now = opts.generatedAt ?? new Date();
  const slug = slugForDate(now);
  const hero = opts.items[0]!;
  const restItems = opts.items.slice(1);
  const sourceCounts: Partial<Record<Source, number>> = {};
  for (const item of opts.items) {
    for (const s of item.sources) {
      sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
    }
  }
  return {
    slug,
    generatedAt: now.toISOString(),
    hero,
    items: restItems,
    meta: {
      config: { schedule: opts.config.schedule, languages: opts.config.languages },
      profile: opts.profile,
      sourceCounts,
    },
  };
}

export function slugForDate(d: Date): string {
  const year = isoWeekYear(d);
  const week = isoWeekNumber(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

function isoWeekYear(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  return target.getUTCFullYear();
}
```

- [ ] **Step 8.4: Re-run test, expect pass**

```bash
npm test -- tests/render/build-issue.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 8.5: Commit**

```bash
git add src/render/build-issue.ts tests/render/build-issue.test.ts
git commit -m "feat(render): build IssueData with iso-week slug"
```

---

## Task 9: Pipeline entry `src/index.ts`

**Files:**
- Create: `src/index.ts`, `data/issues/.gitkeep`
- Create: `tests/e2e.test.ts`

- [ ] **Step 9.1: Write `data/issues/.gitkeep`**

```bash
mkdir -p data/issues
touch data/issues/.gitkeep
```

- [ ] **Step 9.2: Write the failing E2E test**

`tests/e2e.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { runPipeline } from "../src/index.js";

const cfgYaml = `
schedule: weekly
languages: [zh, en]
github_username: alice
profile: { regenerate: false }
llm:
  base_url: https://api.fake.local
  model: fake
sources:
  trending:
    enabled: true
    langs: [rust]
    window: weekly
outputs:
  pages: { enabled: true }
top_n: 2
hero_n: 1
history_window: 4
`;

const profileYaml = `
themes: [Rust 系统编程]
languages: [rust]
exclude_themes: []
notes: low-level
`;

const trendingHtml = `
<html><body>
  <article class="Box-row">
    <h2><a href="/rust-lang/rust">rust-lang / rust</a></h2>
    <p>Empowering everyone to build reliable software.</p>
    <span itemprop="programmingLanguage">Rust</span>
    <a href="/rust-lang/rust/stargazers">90,000</a>
    <span class="d-inline-block float-sm-right">+250 this week</span>
  </article>
  <article class="Box-row">
    <h2><a href="/ratatui-org/ratatui">ratatui-org / ratatui</a></h2>
    <p>Rust TUI library.</p>
    <span itemprop="programmingLanguage">Rust</span>
    <a href="/ratatui-org/ratatui/stargazers">12,400</a>
    <span class="d-inline-block float-sm-right">+320 this week</span>
  </article>
</body></html>`;

const rankFixture = JSON.stringify({
  ranking: [
    { i: 1, score: 95, reason: "Ratatui 命中 Rust + TUI." },
    { i: 0, score: 80, reason: "Rust 本身相关." },
  ],
});
const summaryFixture = JSON.stringify({ zh: "zh摘要", en: "en summary" });

const tmpRoot = path.resolve("tmp-e2e");

afterEach(async () => {
  vi.restoreAllMocks();
  if (existsSync(tmpRoot)) await rm(tmpRoot, { recursive: true, force: true });
});

describe("runPipeline E2E", () => {
  it("produces an issue JSON from mocked sources", async () => {
    await mkdir(path.join(tmpRoot, "config"), { recursive: true });
    await mkdir(path.join(tmpRoot, "data/issues"), { recursive: true });
    await (await import("node:fs/promises")).writeFile(path.join(tmpRoot, "config/config.yaml"), cfgYaml);
    await (await import("node:fs/promises")).writeFile(path.join(tmpRoot, "config/profile.yaml"), profileYaml);

    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("github.com/trending")) return new Response(trendingHtml);
      if (u.endsWith("/chat/completions")) {
        // first call is rank, then 2 summarize calls
        const callIdx = (fetchMock as any).mock.calls.length - 1; // before increment we record at outer
        return new Response(JSON.stringify({ choices: [{ message: { content: callIdx === 1 ? rankFixture : summaryFixture } }] }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.LLM_API_KEY = "sk-test";
    const issue = await runPipeline({ root: tmpRoot, now: new Date("2026-05-04T00:00:00Z") });

    expect(issue.slug).toBe("2026-W19");
    expect(issue.hero.owner).toBe("ratatui-org");
    expect(issue.items[0]!.owner).toBe("rust-lang");
    expect(issue.hero.summary.zh).toBe("zh摘要");

    const written = await readFile(path.join(tmpRoot, "data/issues/2026-W19.json"), "utf8");
    const parsed = JSON.parse(written);
    expect(parsed.slug).toBe("2026-W19");
  });
});
```

- [ ] **Step 9.3: Run test, expect failure**

```bash
npm test -- tests/e2e.test.ts
```
Expected: FAIL — `runPipeline` not exported / module not found.

- [ ] **Step 9.4: Implement `src/index.ts`**

`src/index.ts`:
```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { parseConfig, parseProfile } from "./config.js";
import { fetchTrending } from "./fetchers/trending.js";
import { dedupCandidates } from "./pipeline/dedup.js";
import { rankCandidates } from "./pipeline/rank.js";
import { summarizeAll } from "./pipeline/summarize.js";
import { buildIssue } from "./render/build-issue.js";
import type { Candidate, Config, IssueData, Profile, Source } from "./types.js";

export type RunOpts = {
  root?: string;       // project root, default cwd
  now?: Date;          // override clock for testing
};

export async function runPipeline(opts: RunOpts = {}): Promise<IssueData> {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? new Date();

  const cfgText = await readFile(path.join(root, "config/config.yaml"), "utf8");
  const profText = await readFile(path.join(root, "config/profile.yaml"), "utf8");
  const config: Config = parseConfig(cfgText);
  const profile: Profile = parseProfile(profText);

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY env var is required");

  // 1. fetch
  const fetchResults: { source: Source; items: Candidate[]; error?: unknown }[] = [];
  if (config.sources.trending.enabled) {
    try {
      const items = await fetchTrending({
        langs: config.sources.trending.langs,
        window: config.sources.trending.window,
      });
      fetchResults.push({ source: "trending", items });
    } catch (e) {
      console.warn(`[fetch] trending failed:`, (e as Error).message);
      fetchResults.push({ source: "trending", items: [], error: e });
    }
  }
  const surviving = fetchResults.filter(r => !r.error);
  if (surviving.length < 1) {
    // M1-M3: only trending. We require >=1 surviving source. (M4 raises to 2.)
    throw new Error("no surviving fetcher; aborting");
  }
  const allCandidates = surviving.flatMap(r => r.items);

  // 2. dedup
  const deduped = dedupCandidates(allCandidates);
  if (deduped.length === 0) throw new Error("dedup: zero candidates; aborting");

  // 3. rank
  const ranked = await rankCandidates(deduped, profile, config.topN, {
    baseUrl: config.llm.baseUrl,
    apiKey,
    model: config.llm.model,
  });

  // 4. summarize
  const summarized = await summarizeAll(ranked, {
    baseUrl: config.llm.baseUrl,
    apiKey,
    model: config.llm.model,
  });

  // 5. build issue
  const issue = buildIssue({ config, profile, items: summarized, generatedAt: now });

  // 6. write
  const issuesDir = path.join(root, "data/issues");
  await mkdir(issuesDir, { recursive: true });
  const out = path.join(issuesDir, `${issue.slug}.json`);
  await writeFile(out, JSON.stringify(issue, null, 2) + "\n", "utf8");
  console.log(`Wrote ${out}`);

  return issue;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 9.5: Re-run E2E, expect pass**

```bash
npm test -- tests/e2e.test.ts
```
Expected: PASS — 1 test, output JSON written to `tmp-e2e/data/issues/2026-W19.json`.

- [ ] **Step 9.6: Run full test suite**

```bash
npm test
```
Expected: ALL PASS.

- [ ] **Step 9.7: Typecheck**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 9.8: Commit**

```bash
git add src/index.ts tests/e2e.test.ts data/issues/.gitkeep
git commit -m "feat: end-to-end pipeline with mocked e2e test (M1+M2 done)"
```

---

## Task 10: Astro project scaffolding `web/`

**Files:**
- Create: `web/package.json`, `web/astro.config.mjs`, `web/tsconfig.json`, `web/src/lib/issues.ts`

This task has no test — Astro's dev server is the validation.

- [ ] **Step 10.1: Write `web/package.json`**

`web/package.json`:
```json
{
  "name": "octozine-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^4.16.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 10.2: Write `web/astro.config.mjs`**

`web/astro.config.mjs`:
```js
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://example.github.io",
  base: "/",
  outDir: "./dist",
  trailingSlash: "ignore",
});
```

- [ ] **Step 10.3: Write `web/tsconfig.json`**

`web/tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "include": ["src/**/*", "astro.config.mjs"],
  "exclude": ["dist"]
}
```

- [ ] **Step 10.4: Write `web/src/lib/issues.ts`**

`web/src/lib/issues.ts`:
```ts
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type IssueDataLite = {
  slug: string;
  generatedAt: string;
  hero: any;
  items: any[];
  meta: any;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const issuesDir = path.resolve(here, "../../../data/issues");

export async function listIssues(): Promise<string[]> {
  const files = await readdir(issuesDir);
  return files
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();
}

export async function loadIssue(filename: string): Promise<IssueDataLite> {
  const text = await readFile(path.join(issuesDir, filename), "utf8");
  return JSON.parse(text) as IssueDataLite;
}

export async function loadLatest(): Promise<IssueDataLite | null> {
  const files = await listIssues();
  if (files.length === 0) return null;
  return loadIssue(files[0]!);
}
```

- [ ] **Step 10.5: Install Astro**

```bash
cd web
npm install
cd ..
```

- [ ] **Step 10.6: Verify Astro can boot (no pages yet)**

```bash
cd web
mkdir -p src/pages
echo '---' > src/pages/index.astro
echo '---' >> src/pages/index.astro
echo '<h1>placeholder</h1>' >> src/pages/index.astro
npm run build
cd ..
```
Expected: Astro builds and reports `dist/` written.

- [ ] **Step 10.7: Remove placeholder index**

```bash
rm web/src/pages/index.astro
```

- [ ] **Step 10.8: Commit**

```bash
git add web/package.json web/package-lock.json web/astro.config.mjs web/tsconfig.json web/src/lib/issues.ts
git commit -m "chore(web): scaffold astro project"
```

---

## Task 11: Magazine v3 styles `web/src/styles/global.css`

**Files:**
- Create: `web/src/styles/global.css`

No test — visual validation via dev server in Task 13.

- [ ] **Step 11.1: Write `web/src/styles/global.css`** (port of `elegant-v3.html` styles)

`web/src/styles/global.css`:
```css
:root {
  --bg:           #FAFAF7;
  --fg:           #1A1A1A;
  --fg-strong:    #131313;
  --fg-2:         #555;
  --fg-3:         #888;
  --fg-4:         #999;
  --fg-5:         #aaa;
  --rule:         rgba(0,0,0,0.08);
  --rule-soft:    rgba(0,0,0,0.06);
  --accent:       #B45309;
  --up:           #047857;

  --serif:    "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --sans:     -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
  --mono:     ui-monospace, "SF Mono", "JetBrains Mono", "Menlo", monospace;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
a { color: inherit; text-decoration: none; }
a:hover { text-decoration: underline; }

.page {
  max-width: 800px;
  margin: 1.5rem auto;
  padding: 2.75rem 3.25rem 3.25rem;
  background: var(--bg);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 1.4rem;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 3rem;
}
.brand { display: flex; gap: 0.95rem; align-items: center; }
.mark {
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--fg);
  color: var(--bg);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--serif);
  font-style: italic;
  font-weight: 500;
  font-size: 1.2rem;
}
.brand-name {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.25rem;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.brand-meta {
  font-size: 0.8rem;
  color: var(--fg-4);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-top: 0.3rem;
}
.nav {
  font-size: 0.82rem;
  color: var(--fg-2);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 500;
}
.nav a { margin-left: 1.5rem; }

/* Hero */
.hero { margin-bottom: 3.25rem; }
.tag {
  display: inline-block;
  font-size: 0.75rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  padding-bottom: 1rem;
}
.hero-title {
  font-family: var(--serif);
  font-size: 3.6rem;
  line-height: 1.05;
  font-weight: 400;
  letter-spacing: -0.025em;
  margin: 0 0 1.1rem;
  color: var(--fg-strong);
}
.hero-sub {
  font-family: var(--serif);
  font-size: 1.3rem;
  line-height: 1.4;
  color: var(--fg-2);
  font-style: italic;
  margin: 0 0 1.7rem;
  max-width: 620px;
}
.hero-body {
  font-size: 1.05rem;
  line-height: 1.75;
  color: #2c2c2c;
  margin: 0 0 1.7rem;
  max-width: 640px;
}
.hero-meta {
  display: flex;
  gap: 1.4rem;
  font-size: 0.85rem;
  color: var(--fg-3);
  align-items: center;
  flex-wrap: wrap;
  font-family: var(--mono);
  letter-spacing: 0.02em;
}
.meta-up { color: var(--up); font-weight: 600; }
.meta-sources { color: var(--accent); }

/* List */
.section-label {
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin: 0 0 1.75rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.section-label::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--rule);
}

.item {
  display: flex;
  gap: 1.85rem;
  padding: 1.4rem 0;
  border-bottom: 1px solid var(--rule-soft);
}
.item:last-child { border-bottom: 0; }
.item-num {
  font-family: var(--serif);
  font-size: 1.3rem;
  color: var(--accent);
  font-style: italic;
  min-width: 1.75rem;
  flex-shrink: 0;
  padding-top: 0.15rem;
}
.item-body { flex: 1; }
.item-title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.3rem;
  margin: 0 0 0.5rem;
  letter-spacing: -0.01em;
  color: var(--fg-strong);
}
.item-title small {
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--fg-5);
  font-style: normal;
  margin-left: 0.6rem;
  font-weight: 400;
  letter-spacing: 0.02em;
}
.item-sum {
  font-size: 1rem;
  line-height: 1.65;
  color: #444;
  margin: 0 0 0.6rem;
  max-width: 640px;
}
.item-sum.zh + .item-sum.en { margin-top: -0.1rem; color: #555; font-size: 0.95rem; }
.item-meta {
  font-size: 0.8rem;
  color: var(--fg-4);
  font-family: var(--mono);
  letter-spacing: 0.02em;
}
.item-meta .dot { margin: 0 0.6rem; opacity: 0.5; }

/* Footer */
.footer {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: var(--fg-4);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Responsive */
@media (max-width: 768px) {
  .page { margin: 0; padding: 1.75rem 1.25rem 2rem; border-radius: 0; box-shadow: none; }
  .header { flex-direction: column; align-items: flex-start; gap: 1rem; }
  .nav { display: none; }
  .hero-title { font-size: 2.4rem; }
  .hero-sub { font-size: 1.1rem; }
  .item { flex-direction: column; gap: 0.4rem; }
  .item-num { padding-top: 0; }
}
```

- [ ] **Step 11.2: Commit**

```bash
git add web/src/styles/global.css
git commit -m "feat(web): magazine v3 stylesheet"
```

---

## Task 12: Astro components `web/src/components/`

**Files:**
- Create: `web/src/components/Header.astro`, `web/src/components/Hero.astro`, `web/src/components/Item.astro`

- [ ] **Step 12.1: Write `web/src/components/Header.astro`**

`web/src/components/Header.astro`:
```astro
---
interface Props {
  slug: string;
  languages: string[];
}
const { slug, languages } = Astro.props;
const langLabel = languages.map(l => l === "zh" ? "中" : l.toUpperCase()).join(" / ");
---
<header class="header">
  <div class="brand">
    <div class="mark">o</div>
    <div>
      <div class="brand-name">Octozine</div>
      <div class="brand-meta">{slug.replace("-W", " · Week ")} · {langLabel}</div>
    </div>
  </div>
  <nav class="nav">
    <a href="/">Latest</a>
    <a href="/archive/">Archive</a>
  </nav>
</header>
```

- [ ] **Step 12.2: Write `web/src/components/Hero.astro`**

`web/src/components/Hero.astro`:
```astro
---
interface SummarizedItem {
  owner: string;
  repo: string;
  description: string;
  stars: number;
  starsDelta?: number;
  sources: string[];
  url: string;
  summary: { zh: string; en: string };
  reason: string;
}
interface Props {
  item: SummarizedItem;
  languages: string[];
}
const { item, languages } = Astro.props;
const showZh = languages.includes("zh");
const showEn = languages.includes("en");
const sourcesLabel = item.sources.join(" · ");
---
<section class="hero">
  <div class="tag">本周特别推荐 · Featured</div>
  <h1 class="hero-title">
    <a href={item.url}>{item.repo}</a>
  </h1>
  <p class="hero-sub">{item.description || `${item.owner}/${item.repo}`}</p>
  {showZh && <p class="hero-body">{item.summary.zh}</p>}
  {showEn && <p class="hero-body">{item.summary.en}</p>}
  <div class="hero-meta">
    <span>★ {item.stars.toLocaleString()}</span>
    {item.starsDelta !== undefined && <span class="meta-up">+{item.starsDelta} this period</span>}
    <span class="meta-sources">via {sourcesLabel}</span>
  </div>
</section>
```

- [ ] **Step 12.3: Write `web/src/components/Item.astro`**

`web/src/components/Item.astro`:
```astro
---
interface SummarizedItem {
  owner: string;
  repo: string;
  description: string;
  stars: number;
  starsDelta?: number;
  language?: string;
  topics: string[];
  sources: string[];
  url: string;
  summary: { zh: string; en: string };
  reason: string;
}
interface Props {
  item: SummarizedItem;
  num: number;
  languages: string[];
}
const { item, num, languages } = Astro.props;
const showZh = languages.includes("zh");
const showEn = languages.includes("en");
const numStr = String(num).padStart(2, "0");
const stats = `★ ${item.stars.toLocaleString()}${item.starsDelta !== undefined ? ` · ↑ ${item.starsDelta}` : ""}`;
const metaParts = [
  ...(item.language ? [item.language.toLowerCase()] : []),
  ...item.topics.slice(0, 2),
  `via ${item.sources.join(" · ")}`,
];
---
<article class="item">
  <div class="item-num">{numStr}</div>
  <div class="item-body">
    <h3 class="item-title">
      <a href={item.url}>{item.owner} / {item.repo}</a>
      <small>{stats}</small>
    </h3>
    {showZh && <p class="item-sum zh">{item.summary.zh}</p>}
    {showEn && <p class="item-sum en">{item.summary.en}</p>}
    <div class="item-meta">
      {metaParts.map((p, i) => <Fragment>{i > 0 && <span class="dot">·</span>}<span>{p}</span></Fragment>)}
    </div>
  </div>
</article>
```

- [ ] **Step 12.4: Commit**

```bash
git add web/src/components/
git commit -m "feat(web): header, hero, item astro components"
```

---

## Task 13: Astro pages and end-to-end visual check

**Files:**
- Create: `web/src/pages/index.astro`, `web/src/pages/archive/[slug].astro`, `web/src/pages/archive/index.astro`

- [ ] **Step 13.1: Write `web/src/pages/index.astro`**

`web/src/pages/index.astro`:
```astro
---
import "../styles/global.css";
import Header from "../components/Header.astro";
import Hero from "../components/Hero.astro";
import Item from "../components/Item.astro";
import { loadLatest } from "../lib/issues.js";

const issue = await loadLatest();
---
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{issue ? `Octozine · ${issue.slug}` : "Octozine"}</title>
</head>
<body>
  <main class="page">
    {issue === null ? (
      <p>No issues yet. Run <code>npm run pipeline</code> first.</p>
    ) : (
      <>
        <Header slug={issue.slug} languages={issue.meta.config.languages} />
        <section class="hero-wrap">
          <Hero item={issue.hero} languages={issue.meta.config.languages} />
        </section>
        <div class="section-label">Also worth a look · {issue.items.length} more</div>
        {issue.items.map((it: any, i: number) => <Item item={it} num={i + 2} languages={issue.meta.config.languages} />)}
        <footer class="footer">
          <span>Curated by Octozine</span>
          <span>Issue {issue.slug}</span>
        </footer>
      </>
    )}
  </main>
</body>
</html>
```

- [ ] **Step 13.2: Write `web/src/pages/archive/index.astro`**

`web/src/pages/archive/index.astro`:
```astro
---
import "../../styles/global.css";
import { listIssues } from "../../lib/issues.js";

const files = await listIssues();
const slugs = files.map(f => f.replace(/\.json$/, ""));
---
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Octozine · Archive</title>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="brand">
        <div class="mark">o</div>
        <div>
          <div class="brand-name">Octozine</div>
          <div class="brand-meta">Archive</div>
        </div>
      </div>
      <nav class="nav">
        <a href="/">Latest</a>
      </nav>
    </header>
    {slugs.length === 0 ? <p>No issues yet.</p> : (
      <ul style="list-style:none; padding:0;">
        {slugs.map(slug => (
          <li style="padding: 0.75rem 0; border-bottom: 1px solid var(--rule-soft);">
            <a href={`/archive/${slug}/`} class="item-title" style="font-family: var(--serif);">{slug}</a>
          </li>
        ))}
      </ul>
    )}
  </main>
</body>
</html>
```

- [ ] **Step 13.3: Write `web/src/pages/archive/[slug].astro`**

`web/src/pages/archive/[slug].astro`:
```astro
---
import "../../styles/global.css";
import Header from "../../components/Header.astro";
import Hero from "../../components/Hero.astro";
import Item from "../../components/Item.astro";
import { listIssues, loadIssue } from "../../lib/issues.js";

export async function getStaticPaths() {
  const files = await listIssues();
  return files.map(f => ({ params: { slug: f.replace(/\.json$/, "") } }));
}

const { slug } = Astro.params as { slug: string };
const issue = await loadIssue(`${slug}.json`);
---
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Octozine · {issue.slug}</title>
</head>
<body>
  <main class="page">
    <Header slug={issue.slug} languages={issue.meta.config.languages} />
    <Hero item={issue.hero} languages={issue.meta.config.languages} />
    <div class="section-label">Also worth a look · {issue.items.length} more</div>
    {issue.items.map((it: any, i: number) => <Item item={it} num={i + 2} languages={issue.meta.config.languages} />)}
    <footer class="footer">
      <span>Curated by Octozine</span>
      <span>Issue {issue.slug}</span>
    </footer>
  </main>
</body>
</html>
```

- [ ] **Step 13.4: Generate a real issue (requires LLM API key)**

Set the env var with your key:
```bash
export LLM_API_KEY="sk-your-key-here"
npm run pipeline
```
Expected: writes `data/issues/<slug>.json`. If LLM is unavailable, copy the test fixture as a smoke alternative:
```bash
mkdir -p data/issues
node -e "
const data = {
  slug: '2026-W19', generatedAt: new Date().toISOString(),
  hero: { owner: 'ratatui-org', repo: 'ratatui', description: 'Rust TUI library', stars: 12400, starsDelta: 320, language: 'rust', topics: ['tui'], url: 'https://github.com/ratatui-org/ratatui', sources: ['trending'], sourceMeta: {}, score: 95, reason: 'Rust + TUI 命中', summary: { zh: '用 Rust 写的终端 UI 库，被 gitui、atuin、helix 等新一代终端应用作为基础。', en: 'A Rust library for building rich terminal UIs. It powers a growing wave of TUI tools including gitui, atuin, and helix.' } },
  items: [
    { owner: 'astral-sh', repo: 'uv', description: 'Fast Python package manager', stars: 15200, starsDelta: 180, language: 'rust', topics: ['python'], url: 'https://github.com/astral-sh/uv', sources: ['trending'], sourceMeta: {}, score: 88, reason: 'Rust + 工具链', summary: { zh: '用 Rust 重写的极速 Python 包管理器，目标取代 pip + venv + pip-tools。', en: 'A drop-in replacement for pip and venv, written in Rust. 10–100× faster on common workflows.' } }
  ],
  meta: { config: { schedule: 'weekly', languages: ['zh', 'en'] }, profile: { themes: [], languages: [], excludeThemes: [], notes: '' }, sourceCounts: { trending: 2 } },
};
require('fs').writeFileSync('data/issues/2026-W19.json', JSON.stringify(data, null, 2));
console.log('wrote smoke fixture');
"
```

- [ ] **Step 13.5: Run Astro dev server and visually inspect**

```bash
cd web
npm run dev
```
Open `http://localhost:4321/`. Confirm:
- Magazine layout matches `elegant-v3.html` (米白底、衬线标题、赭红 accent)
- Hero shows the top item with bilingual summaries
- Numbered items 02, 03, ... below the hero
- Visiting `/archive/` shows the slug list
- Visiting `/archive/2026-W19/` shows that issue

Press `Ctrl+C` to stop the dev server.

- [ ] **Step 13.6: Build static site**

```bash
cd web
npm run build
cd ..
```
Expected: `web/dist/` contains `index.html`, `archive/index.html`, `archive/<slug>/index.html`.

- [ ] **Step 13.7: Commit**

```bash
git add web/src/pages/
git commit -m "feat(web): index + archive pages with magazine layout (M3 done)"
```

---

## Task 14: Final verification

- [ ] **Step 14.1: Run all tests + typecheck**

```bash
npm test
npm run typecheck
```
Expected: ALL PASS, exit 0.

- [ ] **Step 14.2: Build web**

```bash
cd web && npm run build && cd ..
```
Expected: build succeeds, `web/dist/` populated.

- [ ] **Step 14.3: Visual smoke (optional, if a real issue exists)**

```bash
cd web && npm run preview
```
Open `http://localhost:4321/` and visually confirm the issue renders correctly.

- [ ] **Step 14.4: Tag the milestone**

```bash
git tag -a m3 -m "MVP: pipeline + LLM + magazine static site"
```

---

## Self-review notes

- **Spec coverage**:
  - §5 architecture — covered by Task 9 entry + project structure across all tasks
  - §6 pipeline — covered by Tasks 5 / 6 / 7 / 8 (dedup / rank / summarize / build-issue)
  - §7 fetcher (trending only) — covered by Task 3
  - §8 LLM adapter — covered by Task 4
  - §9 personalization — partial (static `profile.yaml` only; auto-gen deferred to M6 plan as documented)
  - §10 config — covered by Task 2
  - §11 visual — covered by Tasks 11 + 12 + 13
  - §12 errors — partial (LLM retry + abort logic in Task 7 / 9; Pages deploy + no-candidate paths exercised in §9, deeper coverage in M5 plan)
  - §13 state — partial (`data/issues/*.json` writes work; `seen.json` history dedup deferred to M4 plan)
  - §14 testing — covered by per-task tests + Task 9 E2E
- **Out-of-scope items explicitly deferred**: search/hn/events fetchers (M4), seen.json history dedup (M4), Actions workflow (M5), profile auto-gen (M6), telegram/email/rss (M7), README + promo (M8). Each will be its own plan.
- **Type consistency**: `Candidate`, `RankedCandidate`, `SummarizedItem` defined in Task 1; reused unchanged in Tasks 3, 5, 6, 7, 8, 9. `chat()` signature defined in Task 4; called with same shape in Tasks 6, 7.
- **Placeholder scan**: each step contains the actual code/command. No "TBD"/"similar to". Errors handled with explicit messages.
