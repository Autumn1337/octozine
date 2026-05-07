import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { fetchSearch, parseSearchResponse, substituteRelativeDates } from "../../src/fetchers/search.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("fetchSearch", () => {
  it("keeps successful queries when another query fails", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("bad-query")) return new Response("rate limited", { status: 403 });
      return new Response(JSON.stringify({
        items: [{
          owner: { login: "cli" },
          name: "cli",
          description: "GitHub CLI",
          stargazers_count: 40000,
          language: "Go",
          topics: ["cli"],
          html_url: "https://github.com/cli/cli",
        }],
      }));
    }) as unknown as typeof fetch;

    const out = await fetchSearch({ queries: ["bad-query", "topic:cli"], now: new Date("2026-05-07T00:00:00Z") });
    expect(out).toHaveLength(1);
    expect(out[0]!.owner).toBe("cli");
  });

  it("throws when every query fails or returns nothing usable", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchSearch({ queries: ["a", "b"] })).rejects.toThrow(/all queries/);
  });
});
