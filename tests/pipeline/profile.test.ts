import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  parseStarredResponse,
  buildProfilePrompt,
  serializeProfileYaml,
  flipRegenerateToFalse,
} from "../../src/pipeline/profile.js";
import { parseProfile } from "../../src/config.js";

describe("parseStarredResponse", () => {
  it("extracts owner/repo + description + topics from a real starred payload", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/starred.json", import.meta.url), "utf8"),
    );
    const out = parseStarredResponse(json);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.fullName).toMatch(/^[^/]+\/[^/]+$/);
      expect(typeof s.description).toBe("string");
      expect(Array.isArray(s.topics)).toBe(true);
    }
  });

  it("returns empty for non-array input", () => {
    expect(parseStarredResponse({} as unknown)).toEqual([]);
    expect(parseStarredResponse(null as unknown)).toEqual([]);
  });
});

describe("buildProfilePrompt", () => {
  it("includes user's starred repos and asks for a JSON profile", () => {
    const messages = buildProfilePrompt(
      [{ fullName: "rust-lang/rust", description: "Empowering everyone", topics: ["rust"], language: "Rust" }],
      "alice",
    );
    expect(messages.length).toBe(2);
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.role).toBe("user");
    expect(messages[1]!.content).toContain("rust-lang/rust");
    expect(messages[1]!.content).toContain("alice");
    expect(messages[0]!.content.toLowerCase()).toContain("json");
  });
});

describe("serializeProfileYaml", () => {
  it("round-trips through parseProfile", () => {
    const p = {
      themes: ["LLM tooling"],
      languages: ["rust", "python"],
      excludeThemes: ["web3"],
      notes: "low-level prefs",
    };
    const yaml = serializeProfileYaml(p, { generatedAt: "2026-05-07", username: "alice" });
    expect(yaml).toContain("# generated 2026-05-07 from alice");
    const reparsed = parseProfile(yaml);
    expect(reparsed).toEqual(p);
  });
});

describe("flipRegenerateToFalse", () => {
  it("flips boolean true to false preserving comments", () => {
    const cfg = `# octozine config
profile:
  regenerate: true             # set true and re-run to refresh
schedule: weekly
`;
    const out = flipRegenerateToFalse(cfg);
    expect(out).toContain("regenerate: false");
    expect(out).toContain("# set true and re-run to refresh");
    expect(out).toContain("schedule: weekly");
  });

  it("is idempotent when already false", () => {
    const cfg = "profile:\n  regenerate: false\n";
    expect(flipRegenerateToFalse(cfg)).toBe(cfg);
  });
});
