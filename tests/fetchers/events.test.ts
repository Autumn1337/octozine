import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseWatchEvents } from "../../src/fetchers/events.js";

describe("parseWatchEvents", () => {
  it("returns only WatchEvent rows with valid repo names", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/events.json", import.meta.url), "utf8"),
    );
    const out = parseWatchEvents(json, "octocat");
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) {
      expect(e.owner.length).toBeGreaterThan(0);
      expect(e.repo.length).toBeGreaterThan(0);
      expect(e.starredBy).toBe("octocat");
    }
    // The injected synthetic WatchEvents must round-trip through the parser
    const rust = out.find(e => e.owner === "rust-lang" && e.repo === "rust");
    expect(rust).toBeDefined();
  });

  it("skips non-WatchEvents", () => {
    const out = parseWatchEvents([{ type: "PushEvent" }], "octocat");
    expect(out).toEqual([]);
  });

  it("skips malformed rows", () => {
    const out = parseWatchEvents([{ type: "WatchEvent", repo: { name: "broken" } }], "octocat");
    expect(out).toEqual([]);
  });

  it("returns empty for non-array input", () => {
    expect(parseWatchEvents({} as unknown, "x")).toEqual([]);
    expect(parseWatchEvents(null as unknown, "x")).toEqual([]);
  });
});
