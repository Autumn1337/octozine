import type { Candidate } from "../types.js";

export type SearchOpts = {
  queries: string[];
  now?: Date;
  token?: string | undefined;
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
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { items?: SearchItem[] };
      out.push(...parseSearchResponse(json, raw));
    } catch (e) {
      console.warn(`[fetch:search] query failed "${q}":`, (e as Error).message);
    }
  }
  if (out.length === 0 && opts.queries.length > 0) {
    throw new Error("search fetch failed: all queries returned zero usable results");
  }
  return out;
}
