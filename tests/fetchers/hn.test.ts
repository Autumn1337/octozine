import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  extractRepoFromUrl,
  parseHnHits,
  parseRepoMeta,
} from "../../src/fetchers/hn.js";

describe("extractRepoFromUrl", () => {
  it("matches a clean repo URL", () => {
    expect(extractRepoFromUrl("https://github.com/cli/cli"))
      .toEqual({ owner: "cli", repo: "cli" });
  });
  it("strips trailing slash", () => {
    expect(extractRepoFromUrl("https://github.com/cli/cli/"))
      .toEqual({ owner: "cli", repo: "cli" });
  });
  it("accepts repo subpaths and strips .git suffix", () => {
    expect(extractRepoFromUrl("https://github.com/cli/cli/issues/123"))
      .toEqual({ owner: "cli", repo: "cli" });
    expect(extractRepoFromUrl("https://github.com/cli/cli/blob/main/README.md"))
      .toEqual({ owner: "cli", repo: "cli" });
    expect(extractRepoFromUrl("https://github.com/cli/cli.git"))
      .toEqual({ owner: "cli", repo: "cli" });
    expect(extractRepoFromUrl("https://github.com/blog/foo")).toBeNull();
  });
  it("rejects non-github URLs", () => {
    expect(extractRepoFromUrl("https://gitlab.com/a/b")).toBeNull();
    expect(extractRepoFromUrl("https://example.com")).toBeNull();
  });
  it("rejects reserved owner names", () => {
    expect(extractRepoFromUrl("https://github.com/blog/x")).toBeNull();
    expect(extractRepoFromUrl("https://github.com/issues/x")).toBeNull();
  });
});

describe("parseHnHits", () => {
  it("extracts repo + score from a real HN payload (mixed)", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/hn.json", import.meta.url), "utf8"),
    );
    const hits = parseHnHits(json);
    // Fixture has 2 synthetic repo hits prepended; rest are blog/non-repo URLs.
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const cliHit = hits.find(h => h.owner === "cli" && h.repo === "cli");
    expect(cliHit).toBeDefined();
    expect(cliHit!.hnScore).toBeGreaterThan(0);
    expect(cliHit!.objectId.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.owner.length).toBeGreaterThan(0);
      expect(h.repo.length).toBeGreaterThan(0);
    }
  });

  it("returns empty for hits without urls", () => {
    expect(parseHnHits({ hits: [{ title: "x" }] })).toEqual([]);
  });
});

describe("parseRepoMeta", () => {
  it("converts a /repos response into enrichment shape", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/repos-meta.json", import.meta.url), "utf8"),
    );
    const meta = parseRepoMeta(json);
    expect(meta.stars).toBeGreaterThan(0);
    expect(meta.url).toMatch(/^https:\/\/github\.com\//);
    expect(Array.isArray(meta.topics)).toBe(true);
  });
});
