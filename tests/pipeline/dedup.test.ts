import { describe, it, expect } from "vitest";
import { dedupCandidates } from "../../src/pipeline/dedup.js";
import type { Candidate } from "../../src/types.js";

function mk(owner: string, repo: string, source: Candidate["sources"][number], extra: Partial<Candidate> = {}): Candidate {
  return {
    owner, repo,
    description: "",
    stars: 0,
    topics: [],
    url: `https://github.com/${owner}/${repo}`,
    sources: [source],
    sourceMeta: { [source]: {} },
    ...extra,
  };
}

describe("dedupCandidates", () => {
  it("merges sources for the same owner/repo", () => {
    const a = mk("rust-lang", "rust", "trending", { description: "", sourceMeta: { trending: { window: "weekly" } } });
    const b = mk("rust-lang", "rust", "hn", { description: "Empowering everyone to build reliable and efficient software.", sourceMeta: { hn: { score: 320 } } });
    const out = dedupCandidates([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sources.sort()).toEqual(["hn", "trending"]);
    expect(out[0]!.sourceMeta).toMatchObject({ trending: { window: "weekly" }, hn: { score: 320 } });
    expect(out[0]!.description).toBe("Empowering everyone to build reliable and efficient software.");
  });

  it("treats different repos as different items", () => {
    const out = dedupCandidates([mk("a", "x", "trending"), mk("b", "y", "trending")]);
    expect(out).toHaveLength(2);
  });

  it("is case-insensitive on owner/repo key", () => {
    const out = dedupCandidates([mk("Rust-Lang", "Rust", "trending"), mk("rust-lang", "rust", "hn")]);
    expect(out).toHaveLength(1);
  });
});
