import type { Candidate } from "../types.js";

const RESERVED_OWNERS = new Set([
  "blog", "about", "pricing", "features", "topics", "trending",
  "marketplace", "explore", "settings", "notifications", "issues",
  "pulls", "search", "orgs", "users", "site", "contact",
  "security", "enterprise", "customer-stories", "readme",
  "status", "login", "signup", "join", "new",
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
  const json = (await res.json()) as { hits?: AlgoliaHit[] };
  const hits = parseHnHits(json);

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
      if (r.ok) meta = parseRepoMeta((await r.json()) as RepoApi);
    } catch {
      // best-effort enrichment
    }
    if (!meta) continue;
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
