import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chat } from "../../src/llm/openai-compatible.js";

describe("chat()", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("posts a properly shaped request and returns content", async () => {
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-xyz");
      expect(headers.get("content-type")).toBe("application/json");
      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe("deepseek-chat");
      expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
      expect(body.response_format).toEqual({ type: "json_object" });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
    });
    globalThis.fetch = mock as unknown as typeof fetch;

    const out = await chat({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-xyz",
      model: "deepseek-chat",
      messages: [{ role: "user", content: "ping" }],
      responseFormat: "json",
    });
    expect(out).toBe("{\"ok\":true}");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("strips trailing slash on baseUrl", async () => {
    const mock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    await chat({
      baseUrl: "https://api.openai.com/v1/",
      apiKey: "k",
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: "x" }],
    });
  });

  it("throws on non-2xx response", async () => {
    globalThis.fetch = (async () => new Response("rate limit", { status: 429 })) as typeof fetch;
    await expect(chat({
      baseUrl: "https://x", apiKey: "k", model: "m", messages: [{ role: "user", content: "y" }],
    })).rejects.toThrow(/429/);
  });
});
