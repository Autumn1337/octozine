import type { Candidate, RankedCandidate, Profile } from "../types.js";
import { chat } from "../llm/openai-compatible.js";
import { z } from "zod";

export type RankLLMOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const SYSTEM_PROMPT = `You are a curator who ranks GitHub projects by how well each matches a user's interests.
Output strict JSON: { "ranking": [ { "i": <integer index>, "score": <0-100 integer>, "reason": "<one Chinese sentence>", "matched_themes": string[], "matched_languages": string[] } ] }
Rank EVERY item exactly once. Higher score means stronger match. The reason explains the match in one Chinese sentence (≤ 60 chars).
matched_themes MUST be selected from the supplied core/secondary profile theme names. matched_languages MUST be selected from supplied profile language names.`;

const RankSchema = z.object({
  ranking: z.array(z.object({
    i: z.number().int(),
    score: z.number().int().min(0).max(100),
    reason: z.string().min(1),
    matched_themes: z.array(z.string()),
    matched_languages: z.array(z.string()),
  })),
});

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
    `core_themes: ${JSON.stringify(profile.coreThemes.map(t => ({ name: t.name, weight: t.weight, confidence: t.confidence })))}`,
    `secondary_themes: ${JSON.stringify(profile.secondaryThemes.map(t => ({ name: t.name, weight: t.weight, confidence: t.confidence })))}`,
    `languages: ${JSON.stringify(profile.languages.map(l => ({ name: l.name, weight: l.weight })))}`,
    `exclude_themes: ${JSON.stringify(profile.excludeThemes.map(t => ({ name: t.name, confidence: t.confidence, reason: t.reason })))}`,
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

  // Inner closure: chat + JSON.parse + ranking[] shape check, all in one retry boundary.
  // Truncated/malformed JSON is a real failure mode for token-overflowed LLM responses.
  const callAndParse = async (): Promise<z.infer<typeof RankSchema>["ranking"]> => {
    const text = await callChat();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`rank: LLM output not valid JSON: ${(e as Error).message}; raw: ${text.slice(0, 200)}`);
    }
    try {
      return RankSchema.parse(raw).ranking;
    } catch (e) {
      throw new Error(`rank: LLM output shape invalid: ${(e as Error).message}; raw: ${text.slice(0, 200)}`);
    }
  };

  // Single retry per spec §12: "LLM rank 失败 → 重试 1 次；仍失败 abort".
  let ranking: z.infer<typeof RankSchema>["ranking"];
  try {
    ranking = await callAndParse();
  } catch (e) {
    console.warn(`[rank] first attempt failed, retrying:`, (e as Error).message);
    ranking = await callAndParse();
  }
  ranking.sort((a, b) => b.score - a.score);

  // Validate each LLM-supplied index: must be an in-range integer not seen before.
  // Without this guard, hallucinated indices (negative, float, duplicate, out-of-bounds)
  // silently shrink the result, eventually producing an empty array that buildIssue
  // bombs on with a confusing "empty items" error.
  const result: RankedCandidate[] = [];
  const seenIdx = new Set<number>();
  const allowedThemes = new Set([
    ...profile.coreThemes.map(t => t.name),
    ...profile.secondaryThemes.map(t => t.name),
  ]);
  const allowedLanguages = new Set(profile.languages.map(l => l.name.toLowerCase()));
  for (const r of ranking) {
    if (result.length >= topN) break;
    if (!Number.isInteger(r.i) || r.i < 0 || r.i >= candidates.length) continue;
    if (seenIdx.has(r.i)) continue;
    const matchedThemes = r.matched_themes.filter(t => allowedThemes.has(t));
    const matchedLanguages = r.matched_languages
      .map(l => l.toLowerCase())
      .filter(l => allowedLanguages.has(l));
    seenIdx.add(r.i);
    const c = candidates[r.i]!;
    result.push({ ...c, score: r.score, reason: r.reason, matchedThemes, matchedLanguages });
  }

  if (result.length === 0) {
    const sample = ranking.slice(0, 5).map(r => r.i).join(", ");
    throw new Error(
      `rank: all ${ranking.length} LLM indices were invalid for ${candidates.length} candidates ` +
      `(likely model hallucination). First 5 indices: [${sample}]`,
    );
  }
  const expected = Math.min(topN, candidates.length);
  if (result.length < expected) {
    throw new Error(`rank: only ${result.length}/${expected} valid ranked items returned`);
  }
  return result;
}
