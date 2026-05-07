import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { summarizeOne, summarizeAll } from "../../src/pipeline/summarize.js";
import type { RankedCandidate } from "../../src/types.js";

const item: RankedCandidate = {
  owner: "ratatui-org",
  repo: "ratatui",
  description: "Rust TUI library",
  stars: 12000,
  topics: ["tui", "rust"],
  url: "https://github.com/ratatui-org/ratatui",
  sources: ["trending"],
  sourceMeta: {},
  language: "rust",
  score: 90,
  reason: "Rust TUI",
};

afterEach(() => { vi.restoreAllMocks(); });

describe("summarizeOne", () => {
  it("returns bilingual summary", async () => {
    const fixture = await readFile(new URL("../fixtures/llm-summarize.json", import.meta.url), "utf8");
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: fixture } }],
    }))) as typeof fetch;
    const s = await summarizeOne(item, { baseUrl: "https://x", apiKey: "k", model: "m" });
    expect(s.summary.zh).toContain("Rust");
    expect(s.summary.en).toMatch(/Rust|TUI/);
    expect(s.owner).toBe("ratatui-org");
    expect(s.score).toBe(90);
  });
});

describe("summarizeAll", () => {
  it("respects concurrency and preserves order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = (async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ zh: "z", en: "e" }) } }],
      }));
    }) as typeof fetch;
    const items = Array.from({ length: 5 }, (_, k) => ({ ...item, repo: `r${k}` }));
    const out = await summarizeAll(items, { baseUrl: "https://x", apiKey: "k", model: "m" }, 2);
    expect(out).toHaveLength(5);
    expect(out.map(o => o.repo)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
