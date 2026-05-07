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

  const callChat = (): Promise<string> => chat({
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
  // Single retry per spec §12: "LLM rank 失败 → 重试 1 次；仍失败 abort".
  let text: string;
  try {
    text = await callChat();
  } catch {
    text = await callChat();
  }

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
