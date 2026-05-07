import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseTrending } from "../../src/fetchers/trending.js";

describe("parseTrending", () => {
  it("extracts repos from real trending html", async () => {
    const html = await readFile(new URL("../fixtures/trending.html", import.meta.url), "utf8");
    const items = parseTrending(html);
    expect(items.length).toBeGreaterThan(0);
    const first = items[0];
    expect(first).toBeDefined();
    expect(first!.owner.length).toBeGreaterThan(0);
    expect(first!.repo.length).toBeGreaterThan(0);
    expect(first!.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    expect(first!.stars).toBeGreaterThanOrEqual(0);
    expect(first!.sources).toEqual(["trending"]);
  });

  it("returns empty array on empty html", () => {
    expect(parseTrending("<html></html>")).toEqual([]);
  });
});
