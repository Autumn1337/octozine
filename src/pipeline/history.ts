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
