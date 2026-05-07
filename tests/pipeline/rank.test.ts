import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { rankCandidates } from "../../src/pipeline/rank.js";
import type { Candidate, Profile } from "../../src/types.js";

const profile: Profile = {
  version: 2,
  generatedFrom: {
    username: "alice",
    generatedAt: "2026-05-07",
    signals: { ownedRepos: 1, starredRepos: 2, activityRepos: 0, readmes: 1 },
  },
  coreThemes: [{
    name: "Rust 系统编程",
    weight: 0.9,
    confidence: "high",
    evidence: [{ source: "owned_repo", repo: "alice/rust-tool", note: "owned Rust repo" }],
  }],
  secondaryThemes: [{
    name: "终端 TUI",
    weight: 0.7,
    confidence: "medium",
    evidence: [{ source: "starred_repo", repo: "ratatui-org/ratatui", note: "starred TUI repo" }],
  }],
  languages: [{ name: "rust", weight: 0.9, evidenceCount: 3 }],
  excludeThemes: [{ name: "前端 UI 框架", confidence: "medium", reason: "low signal" }],
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
    expect(out[0]!.matchedThemes).toEqual(["Rust 系统编程"]);
    expect(out[0]!.matchedLanguages).toEqual(["rust"]);
    expect(out[1]!.owner).toBe("ratatui-org");
    expect(out[1]!.score).toBe(85);
  });

  it("propagates fetch errors", async () => {
    globalThis.fetch = (async () => new Response("err", { status: 500 })) as typeof fetch;
    await expect(rankCandidates(candidates, profile, 2, { baseUrl: "https://x", apiKey: "k", model: "m" })).rejects.toThrow(/500/);
  });

  it("rejects when every LLM-supplied index is invalid", async () => {
    // LLM hallucinates: integer indices that pass zod schema but fail runtime
    // bounds-check (out-of-range or negative; candidates.length === 3).
    const badRanking = JSON.stringify({
      ranking: [
        { i: 99,  score: 95, reason: "x", matched_themes: [], matched_languages: [] },
        { i: -1,  score: 90, reason: "y", matched_themes: [], matched_languages: [] },
        { i: 100, score: 85, reason: "z", matched_themes: [], matched_languages: [] },
      ],
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: badRanking } }],
    }))) as typeof fetch;
    await expect(rankCandidates(candidates, profile, 2, {
      baseUrl: "https://x", apiKey: "k", model: "m",
    })).rejects.toThrow(/all 3 LLM indices were invalid/);
  });

  it("dedupes repeated indices in LLM ranking", async () => {
    // LLM returns the same index twice — only one slot should be filled
    const dupRanking = JSON.stringify({
      ranking: [
        { i: 0, score: 95, reason: "first", matched_themes: ["Rust 系统编程"], matched_languages: ["rust"] },
        { i: 0, score: 90, reason: "duplicate of i=0", matched_themes: ["Rust 系统编程"], matched_languages: ["rust"] },
        { i: 2, score: 80, reason: "third", matched_themes: ["终端 TUI"], matched_languages: ["rust"] },
      ],
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: dupRanking } }],
    }))) as typeof fetch;
    await expect(rankCandidates(candidates, profile, 5, {
      baseUrl: "https://x", apiKey: "k", model: "m",
    })).rejects.toThrow(/only 2\/3 valid ranked items/);
  });
});
