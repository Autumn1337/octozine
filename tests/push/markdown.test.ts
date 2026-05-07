import { describe, it, expect } from "vitest";
import {
  escapeMarkdownV2,
  renderTelegramMarkdown,
  renderEmailHtml,
} from "../../src/push/markdown.js";
import type { IssueData } from "../../src/types.js";

const fixture: IssueData = {
  slug: "2026-W19",
  generatedAt: "2026-05-04T00:00:00Z",
  hero: {
    owner: "ratatui-org", repo: "ratatui",
    description: "Rust TUI",
    stars: 12400,
    topics: ["tui"],
    url: "https://github.com/ratatui-org/ratatui",
    sources: ["trending"],
    sourceMeta: {},
    score: 95,
    reason: "Rust + TUI 命中.",
    matchedThemes: ["终端 TUI"],
    matchedLanguages: ["rust"],
    summary: { zh: "Ratatui 是…", en: "Ratatui is…" },
  },
  items: [{
    owner: "rust-lang", repo: "rust",
    description: "lang",
    stars: 90000,
    topics: [],
    url: "https://github.com/rust-lang/rust",
    sources: ["trending"],
    sourceMeta: {},
    score: 80,
    reason: "底层.",
    matchedThemes: ["Rust 系统编程"],
    matchedLanguages: ["rust"],
    summary: { zh: "Rust 是…", en: "Rust is…" },
  }],
  meta: {
    config: { schedule: "weekly", languages: ["zh", "en"] },
    profile: {
      version: 2,
      generatedFrom: {
        username: "alice",
        generatedAt: "2026-05-07",
        signals: { ownedRepos: 0, starredRepos: 0, activityRepos: 0, readmes: 0 },
      },
      coreThemes: [{
        name: "Rust 系统编程",
        weight: 0.9,
        confidence: "high",
        evidence: [{ source: "explicit", note: "test" }],
      }],
      secondaryThemes: [],
      languages: [{ name: "rust", weight: 0.9, evidenceCount: 2 }],
      excludeThemes: [],
      notes: "",
    },
    sourceCounts: { trending: 2 },
  },
};

describe("escapeMarkdownV2", () => {
  it("escapes the reserved set", () => {
    expect(escapeMarkdownV2("a.b!c-d")).toBe("a\\.b\\!c\\-d");
    expect(escapeMarkdownV2("(x)[y]{z}")).toBe("\\(x\\)\\[y\\]\\{z\\}");
  });
  it("preserves text without reserved chars", () => {
    expect(escapeMarkdownV2("plain text 123")).toBe("plain text 123");
  });
});

describe("renderTelegramMarkdown", () => {
  it("includes slug, hero, and items with escaped reserved chars", () => {
    const out = renderTelegramMarkdown(fixture);
    expect(out).toContain("Octozine");
    expect(out).toContain("2026\\-W19");
    expect(out).toContain("ratatui\\-org/ratatui");
    expect(out).toContain("rust\\-lang/rust");
    expect(out).toContain("https://github\\.com/ratatui\\-org/ratatui");
    // typical issue must fit comfortably under Telegram's 4096-char limit
    expect(out.length).toBeLessThanOrEqual(4096);
  });

  it("truncates long issues with a '还有 N 条' tail", () => {
    // Build an issue with 30 items, each carrying a long reason — well over 4096 chars
    const longItem = (n: number) => ({
      ...fixture.items[0]!,
      owner: `org${n}`, repo: `repo${n}`,
      url: `https://github.com/org${n}/repo${n}`,
      reason: "这是一个很长的中文 reason,用于人为撑大整个消息的长度,超过 telegram 4096 字限制。".repeat(3),
      summary: {
        zh: "中文摘要内容".repeat(15),
        en: "English summary content ".repeat(15),
      },
    });
    const fat: IssueData = {
      ...fixture,
      items: Array.from({ length: 30 }, (_, n) => longItem(n)),
    };
    const out = renderTelegramMarkdown(fat);
    expect(out.length).toBeLessThanOrEqual(4096);
    expect(out).toMatch(/还有 \d+ 条/);
  });
});

describe("renderEmailHtml", () => {
  it("returns html with hero + items", () => {
    const out = renderEmailHtml(fixture);
    expect(out).toContain("<html");
    expect(out).toContain("ratatui-org/ratatui");
    expect(out).toContain("Ratatui 是");
    expect(out).toContain("Ratatui is");
  });
});
