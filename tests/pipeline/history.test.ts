import { describe, it, expect } from "vitest";
import {
  filterByHistory,
  updateSeen,
  type SeenMap,
} from "../../src/pipeline/history.js";
import type { Candidate } from "../../src/types.js";

const cand = (owner: string, repo: string): Candidate => ({
  owner, repo,
  description: "",
  stars: 0,
  topics: [],
  url: `https://github.com/${owner}/${repo}`,
  sources: ["trending"],
  sourceMeta: {},
});

describe("filterByHistory", () => {
  it("drops repos whose recorded slug is in the recent window", () => {
    const seen: SeenMap = {
      "a/x": "2026-W18",
      "b/y": "2026-W17",
      "c/z": "2026-W12",
    };
    const candidates = [cand("a", "x"), cand("b", "y"), cand("c", "z"), cand("d", "w")];
    const recentSlugs = ["2026-W18", "2026-W17", "2026-W16", "2026-W15"];
    const out = filterByHistory(candidates, seen, recentSlugs);
    expect(out.map(c => `${c.owner}/${c.repo}`).sort()).toEqual(["c/z", "d/w"]);
  });

  it("matches case-insensitively on owner/repo", () => {
    const seen: SeenMap = { "A/X": "2026-W18" };
    const out = filterByHistory([cand("a", "x")], seen, ["2026-W18"]);
    expect(out).toEqual([]);
  });

  it("returns all candidates when window is empty", () => {
    const seen: SeenMap = { "a/x": "2026-W18" };
    const out = filterByHistory([cand("a", "x")], seen, []);
    expect(out.length).toBe(1);
  });
});

describe("updateSeen", () => {
  it("records new repos under the current slug and preserves prior entries", () => {
    const seen: SeenMap = { "old/repo": "2026-W17" };
    const next = updateSeen(seen, "2026-W18", [
      { owner: "new", repo: "one" },
      { owner: "new", repo: "two" },
    ]);
    expect(next).toEqual({
      "old/repo": "2026-W17",
      "new/one": "2026-W18",
      "new/two": "2026-W18",
    });
  });

  it("overwrites the slug for repos that reappear", () => {
    const seen: SeenMap = { "a/x": "2026-W17" };
    const next = updateSeen(seen, "2026-W18", [{ owner: "a", repo: "x" }]);
    expect(next["a/x"]).toBe("2026-W18");
  });

  it("normalizes keys to lowercase", () => {
    const next = updateSeen({}, "2026-W18", [{ owner: "AlIcE", repo: "BoB" }]);
    expect(next["alice/bob"]).toBe("2026-W18");
  });
});
