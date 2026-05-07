import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseSearchResponse, substituteRelativeDates } from "../../src/fetchers/search.js";

describe("parseSearchResponse", () => {
  it("extracts repos from a real search payload", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/search.json", import.meta.url), "utf8"),
    );
    const items = parseSearchResponse(json, "topic:llm stars:>100");
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.owner.length).toBeGreaterThan(0);
    expect(first.repo.length).toBeGreaterThan(0);
    expect(first.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    expect(first.stars).toBeGreaterThan(0);
    expect(first.sources).toEqual(["search"]);
    expect(Array.isArray(first.topics)).toBe(true);
    expect(first.sourceMeta.search).toMatchObject({ query: "topic:llm stars:>100" });
  });

  it("returns empty array on empty items", () => {
    expect(parseSearchResponse({ items: [] }, "any")).toEqual([]);
  });
});

describe("substituteRelativeDates", () => {
  it("replaces {-Nd} with iso date N days ago", () => {
    const now = new Date("2026-05-07T12:00:00Z");
    expect(substituteRelativeDates("created:>{-30d}", now)).toBe("created:>2026-04-07");
    expect(substituteRelativeDates("pushed:>{-7d} stars:>100", now))
      .toBe("pushed:>2026-04-30 stars:>100");
  });

  it("leaves queries without placeholder untouched", () => {
    expect(substituteRelativeDates("topic:llm", new Date())).toBe("topic:llm");
  });
});
