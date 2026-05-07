import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { runPipeline } from "../src/index.js";

const cfgYaml = `
schedule: weekly
languages: [zh, en]
github_username: alice
profile: { regenerate: false }
llm:
  base_url: https://api.fake.local
  model: fake
sources:
  trending:
    enabled: true
    langs: [rust]
    window: weekly
outputs:
  pages: { enabled: true }
top_n: 2
hero_n: 1
history_window: 4
`;

const profileYaml = `
themes: [Rust 系统编程]
languages: [rust]
exclude_themes: []
notes: low-level
`;

const trendingHtml = `
<html><body>
  <article class="Box-row">
    <h2><a href="/rust-lang/rust">rust-lang / rust</a></h2>
    <p>Empowering everyone to build reliable software.</p>
    <span itemprop="programmingLanguage">Rust</span>
    <a href="/rust-lang/rust/stargazers">90,000</a>
    <span class="d-inline-block float-sm-right">+250 this week</span>
  </article>
  <article class="Box-row">
    <h2><a href="/ratatui-org/ratatui">ratatui-org / ratatui</a></h2>
    <p>Rust TUI library.</p>
    <span itemprop="programmingLanguage">Rust</span>
    <a href="/ratatui-org/ratatui/stargazers">12,400</a>
    <span class="d-inline-block float-sm-right">+320 this week</span>
  </article>
</body></html>`;

const rankFixture = JSON.stringify({
  ranking: [
    { i: 1, score: 95, reason: "Ratatui 命中 Rust + TUI." },
    { i: 0, score: 80, reason: "Rust 本身相关." },
  ],
});
const summaryFixture = JSON.stringify({ zh: "zh摘要", en: "en summary" });

const tmpRoot = path.resolve("tmp-e2e");

afterEach(async () => {
  vi.restoreAllMocks();
  if (existsSync(tmpRoot)) await rm(tmpRoot, { recursive: true, force: true });
});

describe("runPipeline E2E", () => {
  it("produces an issue JSON from mocked sources", async () => {
    await mkdir(path.join(tmpRoot, "config"), { recursive: true });
    await mkdir(path.join(tmpRoot, "data/issues"), { recursive: true });
    await (await import("node:fs/promises")).writeFile(path.join(tmpRoot, "config/config.yaml"), cfgYaml);
    await (await import("node:fs/promises")).writeFile(path.join(tmpRoot, "config/profile.yaml"), profileYaml);

    let callCount = 0;
    const fetchMock = vi.fn(async (url: string | URL): Promise<Response> => {
      const u = String(url);
      if (u.includes("github.com/trending")) return new Response(trendingHtml);
      if (u.endsWith("/chat/completions")) {
        // first LLM call is rank (callCount===0), subsequent calls are summarize
        const idx = callCount++;
        return new Response(JSON.stringify({ choices: [{ message: { content: idx === 0 ? rankFixture : summaryFixture } }] }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.LLM_API_KEY = "sk-test";
    const issue = await runPipeline({ root: tmpRoot, now: new Date("2026-05-04T00:00:00Z") });

    expect(issue.slug).toBe("2026-W19");
    expect(issue.hero.owner).toBe("ratatui-org");
    expect(issue.items[0]!.owner).toBe("rust-lang");
    expect(issue.hero.summary.zh).toBe("zh摘要");

    const written = await readFile(path.join(tmpRoot, "data/issues/2026-W19.json"), "utf8");
    const parsed = JSON.parse(written);
    expect(parsed.slug).toBe("2026-W19");

    const seen = JSON.parse(await readFile(path.join(tmpRoot, "data/seen.json"), "utf8"));
    expect(seen[`${issue.hero.owner}/${issue.hero.repo}`.toLowerCase()]).toBe("2026-W19");
  });

  it("merges trending + search sources and filters history-seen repos", async () => {
    await mkdir(path.join(tmpRoot, "config"), { recursive: true });
    await mkdir(path.join(tmpRoot, "data/issues"), { recursive: true });
    const cfg = cfgYaml.replace(
      /sources:\n  trending:\n    enabled: true\n    langs: \[rust\]\n    window: weekly/,
      `sources:
  trending:
    enabled: true
    langs: [rust]
    window: weekly
  search:
    enabled: true
    queries:
      - "topic:tui language:rust"`,
    );
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(tmpRoot, "config/config.yaml"), cfg);
    await fs.writeFile(path.join(tmpRoot, "config/profile.yaml"), profileYaml);
    // Pre-seed seen.json so rust-lang/rust is excluded by history filter
    await fs.writeFile(
      path.join(tmpRoot, "data/seen.json"),
      JSON.stringify({ "rust-lang/rust": "2026-W18" }),
    );
    // Pre-seed an empty issue at 2026-W18 so listRecentIssueSlugs picks it up
    await fs.writeFile(
      path.join(tmpRoot, "data/issues/2026-W18.json"),
      JSON.stringify({ slug: "2026-W18" }),
    );

    const searchPayload = {
      items: [{
        owner: { login: "charmbracelet" },
        name: "bubbletea",
        description: "Tea-based TUI",
        stargazers_count: 30000,
        language: "Go",
        topics: ["tui"],
        html_url: "https://github.com/charmbracelet/bubbletea",
      }],
    };

    const newRankFixture = JSON.stringify({
      ranking: [
        { i: 0, score: 92, reason: "ratatui 命中 Rust + TUI." },
        { i: 1, score: 88, reason: "bubbletea 是 Go TUI 但接近主题." },
      ],
    });

    let callCount = 0;
    const fetchMock = vi.fn(async (url: string | URL): Promise<Response> => {
      const u = String(url);
      if (u.includes("github.com/trending")) return new Response(trendingHtml);
      if (u.includes("api.github.com/search/repositories")) {
        return new Response(JSON.stringify(searchPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith("/chat/completions")) {
        const idx = callCount++;
        return new Response(JSON.stringify({
          choices: [{ message: { content: idx === 0 ? newRankFixture : summaryFixture } }],
        }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.LLM_API_KEY = "sk-test";
    const issue = await runPipeline({ root: tmpRoot, now: new Date("2026-05-04T00:00:00Z") });

    // history filter must have dropped rust-lang/rust
    const allRepos = [issue.hero, ...issue.items].map(i => `${i.owner}/${i.repo}`.toLowerCase());
    expect(allRepos).not.toContain("rust-lang/rust");
    // Both surviving sources should have contributed
    expect(issue.meta.sourceCounts.trending ?? 0).toBeGreaterThan(0);
    expect(issue.meta.sourceCounts.search ?? 0).toBeGreaterThan(0);
  });
});
