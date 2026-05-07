import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { fetchTrending, parseTrending } from "../../src/fetchers/trending.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("fetchTrending", () => {
  it("keeps successful language pages when another language fails", async () => {
    const html = await readFile(new URL("../fixtures/trending.html", import.meta.url), "utf8");
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/bad-lang?")) return new Response("not found", { status: 404 });
      return new Response(html);
    }) as unknown as typeof fetch;

    const out = await fetchTrending({ langs: ["bad-lang", "rust"], window: "weekly" });
    expect(out.length).toBeGreaterThan(0);
  });

  it("throws when every language page fails or returns nothing usable", async () => {
    globalThis.fetch = vi.fn(async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchTrending({ langs: ["rust"], window: "weekly" })).rejects.toThrow(/all language pages/);
  });
});
