import { describe, it, expect } from "vitest";
import { buildIssue, slugForDate } from "../../src/render/build-issue.js";
import type { SummarizedItem, Profile, Config } from "../../src/types.js";

const profile: Profile = { themes: [], languages: [], excludeThemes: [], notes: "" };

const cfg: Config = {
  schedule: "weekly",
  languages: ["zh", "en"],
  githubUsername: "alice",
  profile: { regenerate: false },
  llm: { baseUrl: "https://x", model: "m" },
  sources: { trending: { enabled: true, langs: [], window: "weekly" } },
  outputs: { pages: { enabled: true } },
  topN: 5,
  heroN: 1,
  historyWindow: 4,
};

function mk(repo: string, sources: SummarizedItem["sources"]): SummarizedItem {
  return {
    owner: "x", repo,
    description: "", stars: 0, topics: [],
    url: `https://github.com/x/${repo}`,
    sources, sourceMeta: {},
    score: 90, reason: "r",
    summary: { zh: "z", en: "e" },
  };
}

describe("slugForDate", () => {
  it("formats ISO week", () => {
    // 2026-05-04 is a Monday, ISO week 19
    expect(slugForDate(new Date("2026-05-04T00:00:00Z"))).toBe("2026-W19");
  });
});

describe("buildIssue", () => {
  it("splits hero from items and counts sources", () => {
    const items = [
      mk("a", ["trending", "hn"]),
      mk("b", ["trending"]),
      mk("c", ["hn"]),
    ];
    const issue = buildIssue({
      config: cfg, profile, items, generatedAt: new Date("2026-05-04T00:00:00Z"),
    });
    expect(issue.slug).toBe("2026-W19");
    expect(issue.hero.repo).toBe("a");
    expect(issue.items.map(i => i.repo)).toEqual(["b", "c"]);
    expect(issue.meta.sourceCounts).toEqual({ trending: 2, hn: 2 });
    expect(issue.meta.config.languages).toEqual(["zh", "en"]);
  });

  it("throws on empty items", () => {
    expect(() => buildIssue({ config: cfg, profile, items: [], generatedAt: new Date() })).toThrow();
  });
});
