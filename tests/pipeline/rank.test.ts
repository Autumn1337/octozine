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

  it("rejects when every LLM-supplied index is invalid", async () => {
    // LLM hallucinates: indices that are out-of-bounds, negative, or non-integer
    const badRanking = JSON.stringify({
      ranking: [
        { i: 99, score: 95, reason: "x" },
        { i: -1, score: 90, reason: "y" },
        { i: 1.5, score: 85, reason: "z" },
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
        { i: 0, score: 95, reason: "first" },
        { i: 0, score: 90, reason: "duplicate of i=0" },
        { i: 2, score: 80, reason: "third" },
      ],
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: dupRanking } }],
    }))) as typeof fetch;
    const out = await rankCandidates(candidates, profile, 5, {
      baseUrl: "https://x", apiKey: "k", model: "m",
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.owner).toBe("rust-lang");
    expect(out[1]!.owner).toBe("ratatui-org");
  });
});
