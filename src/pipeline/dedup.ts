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
    // Use explicit undefined check so a real `starsDelta: 0` survives the merge —
    // the previous `... || prev.starsDelta || c.starsDelta` chain dropped 0 as falsy.
    const starsDelta = (prev.starsDelta !== undefined || c.starsDelta !== undefined)
      ? Math.max(prev.starsDelta ?? 0, c.starsDelta ?? 0)
      : undefined;
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
