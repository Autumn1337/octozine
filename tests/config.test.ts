import { describe, it, expect } from "vitest";
import { parseConfig, parseProfile } from "../src/config.js";

describe("parseConfig", () => {
  it("accepts a minimal valid config", () => {
    const yaml = `
schedule: weekly
languages: [zh, en]
github_username: alice
profile:
  regenerate: false
llm:
  base_url: https://api.deepseek.com
  model: deepseek-chat
sources:
  trending:
    enabled: true
    langs: [rust, python]
    window: weekly
outputs:
  pages: { enabled: true }
top_n: 5
hero_n: 1
history_window: 4
`;
    const cfg = parseConfig(yaml);
    expect(cfg.schedule).toBe("weekly");
    expect(cfg.githubUsername).toBe("alice");
    expect(cfg.sources.trending.langs).toEqual(["rust", "python"]);
    expect(cfg.topN).toBe(5);
  });

  it("rejects missing required fields", () => {
    const yaml = `schedule: weekly\n`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  it("rejects invalid window values", () => {
    const yaml = `
schedule: weekly
languages: [en]
github_username: bob
profile: { regenerate: false }
llm: { base_url: https://x.y, model: m }
sources:
  trending: { enabled: true, langs: [], window: hourly }
outputs:
  pages: { enabled: true }
top_n: 5
hero_n: 1
history_window: 4
`;
    expect(() => parseConfig(yaml)).toThrow();
  });
});

describe("parseProfile", () => {
  it("accepts a minimal profile", () => {
    const yaml = `
themes: ["LLM tooling"]
languages: [rust]
exclude_themes: ["web3"]
notes: |
  prefers low-level work
`;
    const p = parseProfile(yaml);
    expect(p.themes).toEqual(["LLM tooling"]);
    expect(p.notes.trim()).toBe("prefers low-level work");
  });
});
