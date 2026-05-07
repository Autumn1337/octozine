import { describe, it, expect } from "vitest";
import { PROVIDERS, resolveLlmConfig, type ProviderName } from "../../src/llm/providers.js";

describe("PROVIDERS registry", () => {
  it("contains all 7 known providers", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(
      ["deepseek", "groq", "moonshot", "ollama", "openai", "qwen", "zhipu"].sort(),
    );
  });

  it("each entry has a non-empty baseUrl and model", () => {
    for (const [name, p] of Object.entries(PROVIDERS)) {
      expect(p.baseUrl, `${name}.baseUrl`).toMatch(/^https?:\/\//);
      expect(p.model.length, `${name}.model`).toBeGreaterThan(0);
    }
  });
});

describe("resolveLlmConfig", () => {
  it("uses provider defaults when only provider given", () => {
    const r = resolveLlmConfig({ provider: "deepseek" as ProviderName });
    expect(r).toEqual({ baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
  });

  it("user model overrides provider default", () => {
    const r = resolveLlmConfig({ provider: "deepseek" as ProviderName, model: "deepseek-v4-pro" });
    expect(r.baseUrl).toBe("https://api.deepseek.com");
    expect(r.model).toBe("deepseek-v4-pro");
  });

  it("user baseUrl overrides provider default", () => {
    const r = resolveLlmConfig({ provider: "openai" as ProviderName, baseUrl: "https://my-proxy.example/v1" });
    expect(r.baseUrl).toBe("https://my-proxy.example/v1");
    expect(r.model).toBe("gpt-4o-mini");
  });

  it("custom requires explicit baseUrl and model", () => {
    const r = resolveLlmConfig({ provider: "custom" as ProviderName, baseUrl: "https://x.example/v1", model: "m" });
    expect(r).toEqual({ baseUrl: "https://x.example/v1", model: "m" });
  });

  it("custom without baseUrl throws", () => {
    expect(() =>
      resolveLlmConfig({ provider: "custom" as ProviderName, model: "m" }),
    ).toThrow(/baseUrl/i);
  });

  it("custom without model throws", () => {
    expect(() =>
      resolveLlmConfig({ provider: "custom" as ProviderName, baseUrl: "https://x.example/v1" }),
    ).toThrow(/model/i);
  });

  it("unknown provider throws with helpful message", () => {
    expect(() =>
      resolveLlmConfig({ provider: "anthropic" as unknown as ProviderName }),
    ).toThrow(/anthropic/);
  });
});
