# Octozine M4 — 多源 fetchers + 历史去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three additional candidate sources (GitHub Search REST, Hacker News Algolia, GitHub follow-watch events) plus a `data/seen.json`-backed history dedup so the pipeline emits genuinely fresh recommendations every run.

**Architecture:** Each new source is a pure-function fetcher that returns `Candidate[]` and converges on the same shape as `fetchers/trending.ts`. `Promise.allSettled` runs them in parallel; partial failure tolerates as long as `≥ min(2, enabledSources)` survive. After cross-source dedup we apply a history filter that drops repos seen in the last `historyWindow` issues, then write a refreshed `seen.json` at commit time.

**Tech Stack:** TypeScript ESM, vitest fixture-driven tests, `node:fetch`, no new runtime deps.

---

## Pre-conditions

This plan runs on branch `feat/m4-multi-source` (already created). Before any task starts, run `npm test` once and confirm 41/41 baseline passing — that is the green baseline you must not regress.

## File Structure

**Create:**
- `src/fetchers/search.ts` — GitHub Search API fetcher
- `src/fetchers/hn.ts` — Hacker News Algolia fetcher with optional repo-metadata enrichment
- `src/fetchers/events.ts` — GitHub follow-watch events fetcher (gated, optional)
- `src/pipeline/history.ts` — `seen.json` load/filter/update helpers
- `tests/fetchers/search.test.ts`
- `tests/fetchers/hn.test.ts`
- `tests/fetchers/events.test.ts`
- `tests/pipeline/history.test.ts`
- `tests/fixtures/search.json` — recorded GitHub Search response
- `tests/fixtures/hn.json` — recorded HN Algolia response
- `tests/fixtures/repos-meta.json` — recorded GitHub `/repos/{owner}/{repo}` (used to enrich HN hits)
- `tests/fixtures/events.json` — recorded GitHub events response

**Modify:**
- `src/types.ts` — extend `Source` set if needed (already has all 4); no change expected, just verify
- `src/index.ts` — orchestrate all enabled fetchers in parallel, raise surviving threshold, apply history filter, persist `seen.json`
- `src/config.ts` — confirm `search`/`hn`/`events` shapes (already optional in schema; verify)
- `config/config.yaml` — uncomment/add `search` and `hn` blocks with reasonable defaults
- `docs/setup.md` — document optional `GH_TOKEN` secret for enrichment + events
- `package.json` — none expected (no new deps)

**Bootstrap:**
- `data/seen.json` — empty `{}` committed so the file exists for first-run reads

---

## Task 1: History dedup module

**Files:**
- Create: `src/pipeline/history.ts`
- Create: `tests/pipeline/history.test.ts`
- Create: `data/seen.json` (with content `{}\n`)

The `seen.json` shape is `{ "owner/repo": "issue_slug" }` per spec §13. The history filter takes the **last N issue slugs** (sorted descending) and drops candidates whose recorded slug is in that window.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pipeline/history.test.ts
import { describe, it, expect } from "vitest";
import {
  filterByHistory,
  updateSeen,
  type SeenMap,
} from "../../src/pipeline/history.js";
import type { Candidate } from "../../src/types.js";

const cand = (owner: string, repo: string): Candidate => ({
  owner, repo,
  description: "",
  stars: 0,
  topics: [],
  url: `https://github.com/${owner}/${repo}`,
  sources: ["trending"],
  sourceMeta: {},
});

describe("filterByHistory", () => {
  it("drops repos whose recorded slug is in the recent window", () => {
    const seen: SeenMap = {
      "a/x": "2026-W18",
      "b/y": "2026-W17",
      "c/z": "2026-W12",
    };
    const candidates = [cand("a", "x"), cand("b", "y"), cand("c", "z"), cand("d", "w")];
    const recentSlugs = ["2026-W18", "2026-W17", "2026-W16", "2026-W15"]; // window=4
    const out = filterByHistory(candidates, seen, recentSlugs);
    expect(out.map(c => `${c.owner}/${c.repo}`).sort()).toEqual(["c/z", "d/w"]);
  });

  it("matches case-insensitively on owner/repo", () => {
    const seen: SeenMap = { "A/X": "2026-W18" };
    const out = filterByHistory([cand("a", "x")], seen, ["2026-W18"]);
    expect(out).toEqual([]);
  });

  it("returns all candidates when window is empty", () => {
    const seen: SeenMap = { "a/x": "2026-W18" };
    const out = filterByHistory([cand("a", "x")], seen, []);
    expect(out.length).toBe(1);
  });
});

describe("updateSeen", () => {
  it("records new repos under the current slug and preserves prior entries", () => {
    const seen: SeenMap = { "old/repo": "2026-W17" };
    const next = updateSeen(seen, "2026-W18", [
      { owner: "new", repo: "one" },
      { owner: "new", repo: "two" },
    ]);
    expect(next).toEqual({
      "old/repo": "2026-W17",
      "new/one": "2026-W18",
      "new/two": "2026-W18",
    });
  });

  it("overwrites the slug for repos that reappear", () => {
    const seen: SeenMap = { "a/x": "2026-W17" };
    const next = updateSeen(seen, "2026-W18", [{ owner: "a", repo: "x" }]);
    expect(next["a/x"]).toBe("2026-W18");
  });

  it("normalizes keys to lowercase", () => {
    const next = updateSeen({}, "2026-W18", [{ owner: "AlIcE", repo: "BoB" }]);
    expect(next["alice/bob"]).toBe("2026-W18");
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test -- tests/pipeline/history.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// src/pipeline/history.ts
import type { Candidate } from "../types.js";

export type SeenMap = Record<string, string>;
export type RepoKey = { owner: string; repo: string };

const key = (r: { owner: string; repo: string }) =>
  `${r.owner}/${r.repo}`.toLowerCase();

const normalize = (seen: SeenMap): SeenMap => {
  const out: SeenMap = {};
  for (const [k, v] of Object.entries(seen)) out[k.toLowerCase()] = v;
  return out;
};

export function filterByHistory(
  candidates: Candidate[],
  seen: SeenMap,
  recentSlugs: string[],
): Candidate[] {
  if (recentSlugs.length === 0) return candidates;
  const window = new Set(recentSlugs);
  const lower = normalize(seen);
  return candidates.filter(c => {
    const slug = lower[key(c)];
    return !slug || !window.has(slug);
  });
}

export function updateSeen(
  prev: SeenMap,
  currentSlug: string,
  repos: RepoKey[],
): SeenMap {
  const next: SeenMap = normalize(prev);
  for (const r of repos) next[key(r)] = currentSlug;
  return next;
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test -- tests/pipeline/history.test.ts
```

Expected: 7/7 green.

- [ ] **Step 5: Bootstrap seen.json**

Create `data/seen.json` containing exactly `{}\n` so first-run reads succeed.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/history.ts tests/pipeline/history.test.ts data/seen.json
git commit -m "feat(pipeline): history dedup via data/seen.json"
```

---

## Task 2: GitHub Search fetcher

**Files:**
- Create: `src/fetchers/search.ts`
- Create: `tests/fetchers/search.test.ts`
- Create: `tests/fixtures/search.json` (record from real API once)

**Search API contract** (verified):
- `GET https://api.github.com/search/repositories?q=<q>&sort=stars&order=desc&per_page=30`
- 200 → `{ items: [{ owner: { login }, name, description, stargazers_count, language, topics, html_url, pushed_at }, ...] }`
- 403/429 with rate-limit headers when unauthenticated and over budget
- Auth via `Authorization: Bearer <GH_TOKEN>` raises rate-limit to 30 req/min

The fetcher accepts user-written queries verbatim; it only substitutes the placeholder `{-Nd}` (e.g. `created:>{-30d}`) with `now - N days` formatted `YYYY-MM-DD`.

- [ ] **Step 1: Record a fixture once**

```bash
mkdir -p tests/fixtures
curl -s -H "Accept: application/vnd.github+json" \
  "https://api.github.com/search/repositories?q=topic:llm+stars:%3E100&sort=stars&order=desc&per_page=3" \
  > tests/fixtures/search.json
test -s tests/fixtures/search.json && echo "fixture recorded"
```

Expected: file > 1 KB containing `items` array.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/fetchers/search.test.ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseSearchResponse, substituteRelativeDates } from "../../src/fetchers/search.js";

describe("parseSearchResponse", () => {
  it("extracts repos from a real search payload", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/search.json", import.meta.url), "utf8"),
    );
    const items = parseSearchResponse(json, "topic:llm stars:>100");
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.owner.length).toBeGreaterThan(0);
    expect(first.repo.length).toBeGreaterThan(0);
    expect(first.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    expect(first.stars).toBeGreaterThan(0);
    expect(first.sources).toEqual(["search"]);
    expect(Array.isArray(first.topics)).toBe(true);
    expect(first.sourceMeta.search).toMatchObject({ query: "topic:llm stars:>100" });
  });

  it("returns empty array on empty items", () => {
    expect(parseSearchResponse({ items: [] }, "any")).toEqual([]);
  });
});

describe("substituteRelativeDates", () => {
  it("replaces {-Nd} with iso date N days ago", () => {
    const now = new Date("2026-05-07T12:00:00Z");
    expect(substituteRelativeDates("created:>{-30d}", now)).toBe("created:>2026-04-07");
    expect(substituteRelativeDates("pushed:>{-7d} stars:>100", now))
      .toBe("pushed:>2026-04-30 stars:>100");
  });

  it("leaves queries without placeholder untouched", () => {
    expect(substituteRelativeDates("topic:llm", new Date())).toBe("topic:llm");
  });
});
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
npm test -- tests/fetchers/search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement search.ts**

```ts
// src/fetchers/search.ts
import type { Candidate } from "../types.js";

export type SearchOpts = {
  queries: string[];
  now?: Date;
  token?: string | undefined;  // GH_TOKEN if set
};

export function substituteRelativeDates(q: string, now: Date): string {
  return q.replace(/\{-(\d+)d\}/g, (_, days) => {
    const d = new Date(now.getTime() - Number(days) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
}

type SearchItem = {
  owner: { login: string };
  name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  html_url: string;
};

export function parseSearchResponse(json: { items?: SearchItem[] }, query: string): Candidate[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map(it => ({
    owner: it.owner.login,
    repo: it.name,
    description: it.description ?? "",
    stars: it.stargazers_count,
    ...(it.language ? { language: it.language } : {}),
    topics: it.topics ?? [],
    url: it.html_url,
    sources: ["search" as const],
    sourceMeta: { search: { query } },
  }));
}

export async function fetchSearch(opts: SearchOpts): Promise<Candidate[]> {
  const now = opts.now ?? new Date();
  const headers: Record<string, string> = {
    "User-Agent": "octozine/0.1",
    Accept: "application/vnd.github+json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const out: Candidate[] = [];
  for (const raw of opts.queries) {
    const q = substituteRelativeDates(raw, now);
    const url =
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}` +
      `&sort=stars&order=desc&per_page=30`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`search fetch failed for "${q}": HTTP ${res.status}`);
    }
    const json = await res.json() as { items?: SearchItem[] };
    out.push(...parseSearchResponse(json, raw));
  }
  return out;
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
npm test -- tests/fetchers/search.test.ts
```

Expected: 4/4 green.

- [ ] **Step 6: Commit**

```bash
git add src/fetchers/search.ts tests/fetchers/search.test.ts tests/fixtures/search.json
git commit -m "feat(fetchers): GitHub Search REST source with {-Nd} date placeholder"
```

---

## Task 3: Hacker News fetcher

**Files:**
- Create: `src/fetchers/hn.ts`
- Create: `tests/fetchers/hn.test.ts`
- Create: `tests/fixtures/hn.json` (HN Algolia response)
- Create: `tests/fixtures/repos-meta.json` (one GitHub `/repos/{owner}/{repo}` response, used by enrichment)

**HN Algolia contract** (verified):
- `GET https://hn.algolia.com/api/v1/search?query=github.com&tags=story&numericFilters=points>N&hitsPerPage=50`
- 200 → `{ hits: [{ title, url, points, objectID, num_comments, author }, ...] }`
- No auth required.

A hit's `url` may or may not point at a repo root. We accept only URLs of the shape `https?://github.com/<owner>/<repo>` (no trailing path), strict pattern match. Owner/repo are extracted; we then optionally call `/repos/{owner}/{repo}` per repo to enrich with stars/description/topics/language. If `GH_TOKEN` is set we pass it.

- [ ] **Step 1: Record fixtures once**

```bash
curl -s "https://hn.algolia.com/api/v1/search?query=github.com&tags=story&numericFilters=points%3E100&hitsPerPage=20" \
  > tests/fixtures/hn.json
curl -s -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/cli/cli" \
  > tests/fixtures/repos-meta.json
test -s tests/fixtures/hn.json && test -s tests/fixtures/repos-meta.json && echo "fixtures recorded"
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/fetchers/hn.test.ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  extractRepoFromUrl,
  parseHnHits,
  parseRepoMeta,
} from "../../src/fetchers/hn.js";

describe("extractRepoFromUrl", () => {
  it("matches a clean repo URL", () => {
    expect(extractRepoFromUrl("https://github.com/cli/cli"))
      .toEqual({ owner: "cli", repo: "cli" });
  });
  it("strips trailing slash", () => {
    expect(extractRepoFromUrl("https://github.com/cli/cli/"))
      .toEqual({ owner: "cli", repo: "cli" });
  });
  it("rejects deep paths (issues, blob, etc.)", () => {
    expect(extractRepoFromUrl("https://github.com/cli/cli/issues/123")).toBeNull();
    expect(extractRepoFromUrl("https://github.com/blog/foo")).toBeNull();
  });
  it("rejects non-github URLs", () => {
    expect(extractRepoFromUrl("https://gitlab.com/a/b")).toBeNull();
    expect(extractRepoFromUrl("https://example.com")).toBeNull();
  });
  it("rejects reserved owner names", () => {
    // github.com/blog, /about etc are not repos
    expect(extractRepoFromUrl("https://github.com/blog")).toBeNull();
  });
});

describe("parseHnHits", () => {
  it("extracts repo + score from a real HN payload", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/hn.json", import.meta.url), "utf8"),
    );
    const hits = parseHnHits(json);
    // The fixture queries "github.com" so most hits are blog posts;
    // the parser should silently drop those and keep only repo URLs.
    for (const h of hits) {
      expect(h.owner.length).toBeGreaterThan(0);
      expect(h.repo.length).toBeGreaterThan(0);
      expect(typeof h.hnScore).toBe("number");
      expect(h.objectId.length).toBeGreaterThan(0);
    }
  });
});

describe("parseRepoMeta", () => {
  it("converts a /repos response into a Candidate-shaped enrichment", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/repos-meta.json", import.meta.url), "utf8"),
    );
    const meta = parseRepoMeta(json);
    expect(meta.stars).toBeGreaterThan(0);
    expect(meta.url).toMatch(/^https:\/\/github\.com\//);
    expect(Array.isArray(meta.topics)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
npm test -- tests/fetchers/hn.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement hn.ts**

```ts
// src/fetchers/hn.ts
import type { Candidate } from "../types.js";

const RESERVED_OWNERS = new Set([
  "blog", "about", "pricing", "features", "topics", "trending",
  "marketplace", "explore", "settings", "notifications", "issues",
  "pulls", "search", "orgs", "users", "site", "contact",
  "security", "enterprise", "customer-stories", "readme",
]);

export type HnHit = {
  owner: string;
  repo: string;
  hnScore: number;
  objectId: string;
  hnUrl: string;
};

export function extractRepoFromUrl(raw: string): { owner: string; repo: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
  const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  return { owner, repo };
}

type AlgoliaHit = {
  title?: string;
  url?: string | null;
  points?: number | null;
  objectID?: string;
};

export function parseHnHits(json: { hits?: AlgoliaHit[] }): HnHit[] {
  const out: HnHit[] = [];
  for (const h of json.hits ?? []) {
    if (!h.url) continue;
    const r = extractRepoFromUrl(h.url);
    if (!r) continue;
    out.push({
      owner: r.owner,
      repo: r.repo,
      hnScore: typeof h.points === "number" ? h.points : 0,
      objectId: h.objectID ?? "",
      hnUrl: `https://news.ycombinator.com/item?id=${h.objectID ?? ""}`,
    });
  }
  return out;
}

type RepoApi = {
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  html_url: string;
};

export type RepoMeta = {
  description: string;
  stars: number;
  language?: string;
  topics: string[];
  url: string;
};

export function parseRepoMeta(json: RepoApi): RepoMeta {
  return {
    description: json.description ?? "",
    stars: json.stargazers_count,
    ...(json.language ? { language: json.language } : {}),
    topics: json.topics ?? [],
    url: json.html_url,
  };
}

export type HnOpts = {
  minScore: number;
  token?: string | undefined;
  hitsPerPage?: number;
};

export async function fetchHn(opts: HnOpts): Promise<Candidate[]> {
  const hitsPerPage = opts.hitsPerPage ?? 50;
  const url =
    `https://hn.algolia.com/api/v1/search?query=github.com&tags=story` +
    `&numericFilters=points%3E${opts.minScore}&hitsPerPage=${hitsPerPage}`;
  const res = await fetch(url, { headers: { "User-Agent": "octozine/0.1" } });
  if (!res.ok) throw new Error(`hn fetch failed: HTTP ${res.status}`);
  const json = await res.json() as { hits?: AlgoliaHit[] };
  const hits = parseHnHits(json);

  // Dedup hits within HN by repo, keep the highest-score one
  const byRepo = new Map<string, HnHit>();
  for (const h of hits) {
    const k = `${h.owner}/${h.repo}`.toLowerCase();
    const prev = byRepo.get(k);
    if (!prev || h.hnScore > prev.hnScore) byRepo.set(k, h);
  }

  const headers: Record<string, string> = {
    "User-Agent": "octozine/0.1",
    Accept: "application/vnd.github+json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const out: Candidate[] = [];
  for (const h of byRepo.values()) {
    let meta: RepoMeta | null = null;
    try {
      const r = await fetch(`https://api.github.com/repos/${h.owner}/${h.repo}`, { headers });
      if (r.ok) meta = parseRepoMeta(await r.json() as RepoApi);
    } catch {
      // enrichment is best-effort; if it fails we skip this hit
    }
    if (!meta) continue;  // skip un-enrichable hits — better than missing stars
    out.push({
      owner: h.owner,
      repo: h.repo,
      description: meta.description,
      stars: meta.stars,
      ...(meta.language ? { language: meta.language } : {}),
      topics: meta.topics,
      url: meta.url,
      sources: ["hn"],
      sourceMeta: { hn: { score: h.hnScore, story_id: h.objectId, story_url: h.hnUrl } },
    });
  }
  return out;
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
npm test -- tests/fetchers/hn.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/fetchers/hn.ts tests/fetchers/hn.test.ts tests/fixtures/hn.json tests/fixtures/repos-meta.json
git commit -m "feat(fetchers): HN Algolia source with /repos enrichment"
```

---

## Task 4: GitHub follow-watch events fetcher (optional, gated)

**Files:**
- Create: `src/fetchers/events.ts`
- Create: `tests/fetchers/events.test.ts`
- Create: `tests/fixtures/events.json`

**Contract:**
- `GET https://api.github.com/users/{user}/following?per_page=100` → list of users
- `GET https://api.github.com/users/{u}/events/public?per_page=30` → events; we keep only `WatchEvent` type
- Each `WatchEvent` has `repo: { name: "owner/repo", url: "https://api.github.com/repos/owner/repo" }`
- Then enrich via `/repos/{owner}/{repo}` (reuse `parseRepoMeta` from hn.ts via re-export)

**Auth:** events on private follows require `read:user` scope, but public follows + public events work with default `GITHUB_TOKEN`. Spec §7 lists this as `enabled: false` default. Errors should warn-and-skip; the fetcher must throw only on a hard auth failure for the **first** request.

To keep cost bounded: take at most the first 20 followed users, at most 5 most-recent WatchEvent entries each.

- [ ] **Step 1: Record fixtures**

```bash
# We don't need real auth here for parsing; record a small public events page.
# This may be empty for some users — pick one with public activity.
curl -s -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/torvalds/events/public?per_page=10" \
  > tests/fixtures/events.json
test -s tests/fixtures/events.json && echo "fixture recorded"
```

If torvalds yields no `WatchEvent` rows, hand-edit the fixture to inject one synthetic `WatchEvent` for testability — the parser only needs structure, not provenance.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/fetchers/events.test.ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseWatchEvents } from "../../src/fetchers/events.js";

describe("parseWatchEvents", () => {
  it("returns only WatchEvent rows with valid repo names", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/events.json", import.meta.url), "utf8"),
    );
    const out = parseWatchEvents(json, "octocat");
    for (const e of out) {
      expect(e.owner.length).toBeGreaterThan(0);
      expect(e.repo.length).toBeGreaterThan(0);
      expect(e.starredBy).toBe("octocat");
    }
  });

  it("skips non-WatchEvents", () => {
    const out = parseWatchEvents([{ type: "PushEvent" }], "octocat");
    expect(out).toEqual([]);
  });

  it("skips malformed rows", () => {
    const out = parseWatchEvents([{ type: "WatchEvent", repo: { name: "broken" } }], "octocat");
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
npm test -- tests/fetchers/events.test.ts
```

- [ ] **Step 4: Implement events.ts**

```ts
// src/fetchers/events.ts
import type { Candidate } from "../types.js";
import { parseRepoMeta, type RepoMeta } from "./hn.js";

export type WatchHit = { owner: string; repo: string; starredBy: string };

type EventApi = { type?: string; repo?: { name?: string } };

export function parseWatchEvents(json: unknown, user: string): WatchHit[] {
  if (!Array.isArray(json)) return [];
  const out: WatchHit[] = [];
  for (const e of json as EventApi[]) {
    if (e.type !== "WatchEvent") continue;
    const name = e.repo?.name;
    if (!name) continue;
    const [owner, repo] = name.split("/");
    if (!owner || !repo) continue;
    out.push({ owner, repo, starredBy: user });
  }
  return out;
}

export type EventsOpts = {
  username: string;
  token: string;            // required for events
  maxFollowing?: number;
  maxEventsPerUser?: number;
};

export async function fetchEvents(opts: EventsOpts): Promise<Candidate[]> {
  const maxFollowing = opts.maxFollowing ?? 20;
  const maxEventsPerUser = opts.maxEventsPerUser ?? 5;
  const headers: Record<string, string> = {
    "User-Agent": "octozine/0.1",
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${opts.token}`,
  };

  const followingRes = await fetch(
    `https://api.github.com/users/${encodeURIComponent(opts.username)}/following?per_page=${maxFollowing}`,
    { headers },
  );
  if (!followingRes.ok) throw new Error(`events: following list failed HTTP ${followingRes.status}`);
  const following = await followingRes.json() as { login: string }[];

  const watches: WatchHit[] = [];
  for (const f of following) {
    try {
      const r = await fetch(
        `https://api.github.com/users/${encodeURIComponent(f.login)}/events/public?per_page=30`,
        { headers },
      );
      if (!r.ok) continue;
      const evs = await r.json();
      const parsed = parseWatchEvents(evs, f.login).slice(0, maxEventsPerUser);
      watches.push(...parsed);
    } catch { /* per-user soft failure */ }
  }

  // Dedup by repo, keep first follower as the "credit"
  const byRepo = new Map<string, WatchHit>();
  for (const w of watches) {
    const k = `${w.owner}/${w.repo}`.toLowerCase();
    if (!byRepo.has(k)) byRepo.set(k, w);
  }

  const out: Candidate[] = [];
  for (const w of byRepo.values()) {
    let meta: RepoMeta | null = null;
    try {
      const r = await fetch(`https://api.github.com/repos/${w.owner}/${w.repo}`, { headers });
      if (r.ok) meta = parseRepoMeta(await r.json());
    } catch { /* skip */ }
    if (!meta) continue;
    out.push({
      owner: w.owner,
      repo: w.repo,
      description: meta.description,
      stars: meta.stars,
      ...(meta.language ? { language: meta.language } : {}),
      topics: meta.topics,
      url: meta.url,
      sources: ["events"],
      sourceMeta: { events: { starred_by: w.starredBy } },
    });
  }
  return out;
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
npm test -- tests/fetchers/events.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/fetchers/events.ts tests/fetchers/events.test.ts tests/fixtures/events.json
git commit -m "feat(fetchers): GitHub follow-watch events source (gated by GH_TOKEN)"
```

---

## Task 5: Wire all fetchers + history into the pipeline

**Files:**
- Modify: `src/index.ts`
- Modify: `src/types.ts` — add `RecentSlugs` helper if needed (probably not; keep simple)
- Modify: `tests/e2e.test.ts` — extend e2e to cover at least 2 sources

This task replaces the M1-M3 single-source fetch block with a parallel `Promise.allSettled` orchestrator and adds the history dedup step plus `seen.json` persistence.

- [ ] **Step 1: Read the existing e2e test to understand expectations**

```bash
cat tests/e2e.test.ts
```

Note its current shape; you'll add a second-source case at Step 6.

- [ ] **Step 2: Replace the fetch block in `src/index.ts`**

The new shape, replacing lines 28-46 of the current file:

```ts
// 1. fetch — parallel, partial failure tolerant
type FetchEntry = { source: Source; items: Candidate[]; error?: unknown };
const ghToken = process.env.GH_TOKEN;
const enabled: { source: Source; run: () => Promise<Candidate[]> }[] = [];
if (config.sources.trending.enabled) {
  enabled.push({
    source: "trending",
    run: () => fetchTrending({
      langs: config.sources.trending.langs,
      window: config.sources.trending.window,
    }),
  });
}
if (config.sources.search?.enabled) {
  enabled.push({
    source: "search",
    run: () => fetchSearch({
      queries: config.sources.search!.queries,
      now,
      ...(ghToken ? { token: ghToken } : {}),
    }),
  });
}
if (config.sources.hn?.enabled) {
  enabled.push({
    source: "hn",
    run: () => fetchHn({
      minScore: config.sources.hn!.minScore,
      ...(ghToken ? { token: ghToken } : {}),
    }),
  });
}
if (config.sources.events?.enabled) {
  if (!ghToken) {
    console.warn("[fetch] events enabled but GH_TOKEN missing; skipping events");
  } else {
    enabled.push({
      source: "events",
      run: () => fetchEvents({ username: config.githubUsername, token: ghToken }),
    });
  }
}

const settled = await Promise.allSettled(enabled.map(e => e.run()));
const fetchResults: FetchEntry[] = settled.map((r, i) => {
  const source = enabled[i]!.source;
  if (r.status === "fulfilled") return { source, items: r.value };
  console.warn(`[fetch] ${source} failed:`, (r.reason as Error)?.message ?? r.reason);
  return { source, items: [], error: r.reason };
});

const surviving = fetchResults.filter(r => !r.error);
const requiredSurvivors = Math.min(2, enabled.length);
if (surviving.length < requiredSurvivors) {
  throw new Error(
    `only ${surviving.length}/${enabled.length} fetchers survived; require >= ${requiredSurvivors}; aborting`,
  );
}
const allCandidates = surviving.flatMap(r => r.items);
```

The corresponding new imports at top:

```ts
import { fetchSearch } from "./fetchers/search.js";
import { fetchHn } from "./fetchers/hn.js";
import { fetchEvents } from "./fetchers/events.js";
import { filterByHistory, updateSeen, type SeenMap } from "./pipeline/history.js";
```

- [ ] **Step 3: Add the history dedup step after cross-source dedup**

Insert immediately after `const deduped = dedupCandidates(allCandidates);`:

```ts
// 2b. history dedup — drop repos seen in last N issues
const seenPath = path.join(root, "data/seen.json");
let seen: SeenMap = {};
try {
  seen = JSON.parse(await readFile(seenPath, "utf8")) as SeenMap;
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const recentSlugs = await listRecentIssueSlugs(
  path.join(root, "data/issues"),
  config.historyWindow,
);
const fresh = filterByHistory(deduped, seen, recentSlugs);
if (fresh.length === 0) throw new Error("history dedup: zero fresh candidates; aborting");
```

`listRecentIssueSlugs` is a small helper added to the same file (after `runPipeline`):

```ts
import { readdir } from "node:fs/promises";

async function listRecentIssueSlugs(dir: string, n: number): Promise<string[]> {
  if (n <= 0) return [];
  let names: string[];
  try { names = await readdir(dir); } catch { return []; }
  const slugs = names
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
  return slugs.slice(0, n);
}
```

Replace the current `if (deduped.length === 0)` early-abort with one based on `fresh`. Pass `fresh` (not `deduped`) into `rankCandidates`.

- [ ] **Step 4: Persist seen.json after building the issue**

After `await writeFile(out, JSON.stringify(issue, null, 2) + "\n", "utf8");`:

```ts
const issueRepoKeys = [issue.hero, ...issue.items].map(i => ({ owner: i.owner, repo: i.repo }));
const nextSeen = updateSeen(seen, issue.slug, issueRepoKeys);
await writeFile(seenPath, JSON.stringify(nextSeen, null, 2) + "\n", "utf8");
console.log(`Updated ${seenPath}`);
```

- [ ] **Step 5: Run the existing test suite**

```bash
npm test
```

Expected: still 41+ green (existing tests unaffected; e2e may need a tiny update if it asserts surviving threshold — check before declaring done).

- [ ] **Step 6: Add an e2e case covering parallel sources + history filter**

Extend `tests/e2e.test.ts` with a case that mocks both trending fetch (HTTP) and at least one other fetcher to assert:
- Both sources contribute candidates
- A repo present in `seen.json` for a recent slug is excluded from the issue
- `seen.json` on disk is updated with the new slug after the run

(Use the existing fixtures + a synthetic `seen.json` written into a tmpdir-rooted run.)

Concrete assertions:

```ts
expect(issue.meta.sourceCounts.trending).toBeGreaterThan(0);
expect(issue.meta.sourceCounts.search).toBeGreaterThan(0);
expect([issue.hero, ...issue.items].every(i => `${i.owner}/${i.repo}` !== "blacklisted/repo")).toBe(true);
const updatedSeen = JSON.parse(await readFile(seenPath, "utf8"));
expect(updatedSeen[`${issue.hero.owner}/${issue.hero.repo}`.toLowerCase()]).toBe(issue.slug);
```

- [ ] **Step 7: Commit**

```bash
git add src/index.ts tests/e2e.test.ts
git commit -m "feat(pipeline): parallel multi-source orchestration + history dedup wiring"
```

---

## Task 6: Expand config + setup docs

**Files:**
- Modify: `config/config.yaml`
- Modify: `docs/setup.md`

- [ ] **Step 1: Expand config.yaml**

Replace the existing `sources:` block with:

```yaml
sources:
  trending:
    enabled: true
    langs: [rust, python, typescript, go]
    window: weekly
  search:
    enabled: true
    queries:
      - "topic:llm stars:>100 created:>{-30d}"
      - "topic:cli language:rust pushed:>{-7d}"
  hn:
    enabled: true
    min_score: 100
  events:
    enabled: false   # set true and add a GH_TOKEN secret to track who-starred-what among accounts you follow
```

- [ ] **Step 2: Add a `GH_TOKEN` section to `docs/setup.md`**

Append a new subsection just before "Troubleshooting":

```markdown
### Optional: `GH_TOKEN` secret

The HN and events sources call the GitHub REST API. Without auth you have a 60 req/h budget; with a token, 5000 req/h.

1. Create a fine-grained PAT at https://github.com/settings/tokens (no special scopes for HN; `read:user` only if you enable `events`)
2. Add it as a repo secret named `GH_TOKEN`
3. The workflow already passes it through; nothing else to change.

If you hit `403 rate limit exceeded` from HN runs, set this token. If you have it set and don't need events, no harm done.
```

- [ ] **Step 3: Confirm the workflow already passes GH_TOKEN**

Open `.github/workflows/daily.yml` and verify the "Run pipeline" step contains:

```yaml
env:
  LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
  GH_TOKEN:    ${{ secrets.GH_TOKEN }}
```

If `GH_TOKEN` is missing, add it. (Spec §15 already specifies this.)

- [ ] **Step 4: Run typecheck + full test**

```bash
npm run typecheck && npm test
```

Both must pass.

- [ ] **Step 5: Commit**

```bash
git add config/config.yaml docs/setup.md .github/workflows/daily.yml
git commit -m "docs(m4): enable search/hn in default config; document GH_TOKEN"
```

---

## Task 7: Smoke-run and verify

**Files:** none (verification step)

- [ ] **Step 1: Local pipeline run (real APIs)**

```bash
LLM_API_KEY="<your key>" npm run pipeline
```

Expected:
- `[fetch] trending`, `[fetch] search`, `[fetch] hn` all log success (or one HN soft-fails — that is acceptable as long as ≥2 survive)
- `data/issues/<slug>.json` written with `meta.sourceCounts` showing ≥ 2 sources
- `data/seen.json` updated with new repo keys

- [ ] **Step 2: Run again immediately**

```bash
LLM_API_KEY="<your key>" npm run pipeline
```

Expected:
- The newly-added repos do NOT reappear in the second issue (history dedup proven)
- If the slug is the same week, the second run overwrites — that's fine; what matters is "fresh" set.

If the second run fails with "history dedup: zero fresh candidates", that proves the filter is working but the candidate pool is too small. Acceptable for the test; in real CI it shouldn't trigger because runs are weekly.

- [ ] **Step 3: Mark task done if smoke passes**

No commit — just observation.

---

## Self-Review Notes

**Spec coverage check:**
- §3 多源聚合 — Tasks 2, 3, 4 ✓
- §3 跨源 + 历史去重 — Task 1 + Task 5 ✓
- §6 fetch 并发 + ≥2 survivor 阈值 — Task 5 ✓
- §6 dedup 跨源合并 — already done in M1 (`src/pipeline/dedup.ts`) ✓
- §7 数据源细节 — Tasks 2/3/4 implement all four ✓
- §13 `seen.json` 形态 — Task 1 ✓
- §15 daily.yml 透传 GH_TOKEN — Task 6 ✓
- §10 config.yaml `sources.search/hn/events` — Task 6 ✓

**Placeholder scan:** none.

**Type consistency:** `Source = "trending" | "search" | "hn" | "events"` already in types.ts; all fetchers emit one of these in `sources: [...]`. `RepoMeta` exported from hn.ts and reused in events.ts.

**Ambiguity check resolved:**
- Surviving threshold: `Math.min(2, enabledCount)` — explicit (not just `>= 2`)
- HN reserved-owner filter: explicit list to avoid `github.com/blog/...` style false positives
- History window 0 → no filtering (passthrough)
