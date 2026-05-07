import { describe, it, expect, vi } from "vitest";
import { pushTelegram } from "../../src/push/telegram.js";
import type { IssueData } from "../../src/types.js";

const minimal = (slug = "2026-W19"): IssueData => ({
  slug,
  generatedAt: "2026-05-04T00:00:00Z",
  hero: {
    owner: "a", repo: "b", description: "",
    stars: 1, topics: [],
    url: "https://github.com/a/b",
    sources: ["trending"], sourceMeta: {},
    score: 100, reason: "r",
    matchedThemes: [],
    matchedLanguages: [],
    summary: { zh: "x", en: "y" },
  },
  items: [],
  meta: {
    config: { schedule: "weekly", languages: ["zh"] },
    profile: {
      version: 2,
      generatedFrom: {
        username: "alice",
        generatedAt: "2026-05-07",
        signals: { ownedRepos: 0, starredRepos: 0, activityRepos: 0, readmes: 0 },
      },
      coreThemes: [{
        name: "test",
        weight: 0.5,
        confidence: "low",
        evidence: [{ source: "explicit", note: "test" }],
      }],
      secondaryThemes: [],
      languages: [],
      excludeThemes: [],
      notes: "",
    },
    sourceCounts: {},
  },
});

describe("pushTelegram", () => {
  it("POSTs sendMessage with markdown_v2 to bot API", async () => {
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }));
    }) as unknown as typeof fetch;

    await pushTelegram(minimal(), { token: "TOKEN", chatId: "123" });
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    const body = JSON.parse(calls[0]!.body);
    expect(body.chat_id).toBe("123");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain("Octozine");
  });

  it("throws on bot API error", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(pushTelegram(minimal(), { token: "T", chatId: "0" })).rejects.toThrow(/telegram/i);
  });
});
