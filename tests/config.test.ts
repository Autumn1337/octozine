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

describe("parseConfig llm provider resolution", () => {
  const base = `
schedule: weekly
languages: [zh, en]
github_username: x
profile: { regenerate: false }
sources:
  trending: { enabled: true, langs: [], window: weekly }
outputs:
  pages: { enabled: true }
top_n: 5
hero_n: 1
history_window: 4
`;

  it("provider name resolves to baseUrl + model", () => {
    const cfg = parseConfig(base + "llm:\n  provider: openai\n");
    expect(cfg.llm.baseUrl).toBe("https://api.openai.com/v1");
    expect(cfg.llm.model).toBe("gpt-5.4-mini");
  });

  it("provider + model override", () => {
    const cfg = parseConfig(base + "llm:\n  provider: deepseek\n  model: deepseek-v4-pro\n");
    expect(cfg.llm.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.llm.model).toBe("deepseek-v4-pro");
  });

  it("custom provider requires baseUrl + model", () => {
    expect(() => parseConfig(base + "llm:\n  provider: custom\n  model: m\n")).toThrow();
  });

  it("backward compat: bare base_url + model works (no provider field)", () => {
    const cfg = parseConfig(base + "llm:\n  base_url: https://api.deepseek.com\n  model: deepseek-chat\n");
    expect(cfg.llm.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.llm.model).toBe("deepseek-chat");
  });
});

describe("parseProfile", () => {
  it("accepts a v2 profile", () => {
    const yaml = `
version: 2
generated_from:
  username: alice
  generated_at: 2026-05-07
  signals:
    owned_repos: 1
    starred_repos: 2
    activity_repos: 1
    readmes: 1
core_themes:
  - name: LLM inference tooling
    weight: 0.9
    confidence: high
    evidence:
      - source: owned_repo
        repo: alice/infer
        note: owned repo
secondary_themes: []
languages:
  - name: rust
    weight: 0.8
    evidence_count: 2
exclude_themes:
  - name: web3
    confidence: medium
    reason: explicit exclude
notes: |
  prefers low-level work
`;
    const p = parseProfile(yaml);
    expect(p.version).toBe(2);
    expect(p.coreThemes[0]!.name).toBe("LLM inference tooling");
    expect(p.languages[0]!.name).toBe("rust");
    expect(p.notes.trim()).toBe("prefers low-level work");
  });
});
