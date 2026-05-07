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
  token: string;
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
  if (!followingRes.ok) {
    throw new Error(`events: following list failed HTTP ${followingRes.status}`);
  }
  const following = (await followingRes.json()) as { login: string }[];

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
    } catch {
      // per-user soft failure
    }
  }

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
    } catch {
      // skip
    }
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
