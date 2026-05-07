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
    summary: { zh: "Rust 是…", en: "Rust is…" },
  }],
  meta: {
    config: { schedule: "weekly", languages: ["zh", "en"] },
    profile: { themes: [], languages: [], excludeThemes: [], notes: "" },
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
    expect(out).toContain("https://github.com/ratatui-org/ratatui");
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
