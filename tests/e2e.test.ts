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
version: 2
generated_from:
  username: alice
  generated_at: 2026-05-04
  signals:
    owned_repos: 1
    starred_repos: 2
    activity_repos: 0
    readmes: 1
core_themes:
  - name: Rust 系统编程
    weight: 0.9
    confidence: high
    evidence:
      - source: owned_repo
        repo: alice/rust-tool
        note: owned Rust repo
secondary_themes:
  - name: 终端 TUI
    weight: 0.7
    confidence: medium
    evidence:
      - source: starred_repo
        repo: ratatui-org/ratatui
        note: starred TUI repo
languages:
  - name: rust
    weight: 0.9
    evidence_count: 2
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
    { i: 1, score: 95, reason: "Ratatui 命中 Rust + TUI.", matched_themes: ["终端 TUI"], matched_languages: ["rust"] },
    { i: 0, score: 80, reason: "Rust 本身相关.", matched_themes: ["Rust 系统编程"], matched_languages: ["rust"] },
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
        { i: 0, score: 92, reason: "ratatui 命中 Rust + TUI.", matched_themes: ["终端 TUI"], matched_languages: ["rust"] },
        { i: 1, score: 88, reason: "bubbletea 是 Go TUI 但接近主题.", matched_themes: ["终端 TUI"], matched_languages: [] },
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

  it("first-fork path: profile.yaml absent → auto-generate, do NOT flip regenerate flag", async () => {
    await mkdir(path.join(tmpRoot, "config"), { recursive: true });
    await mkdir(path.join(tmpRoot, "data/issues"), { recursive: true });
    // Default fork shape: regenerate stays false, profile.yaml does not exist
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(tmpRoot, "config/config.yaml"), cfgYaml);
    // Note: NO profile.yaml is written

    const generatedProfile = JSON.stringify({
      version: 2,
      core_themes: [{
        name: "LLM tooling and inference",
        weight: 0.9,
        confidence: "high",
        evidence: [{ source: "owned_repo", repo: "alice/infer", note: "owned inference repo" }],
      }],
      secondary_themes: [],
      languages: [{ name: "rust", weight: 0.8, evidence_count: 1 }],
      exclude_themes: [],
      notes: "Auto-generated from GitHub signals.",
    });

    let llmCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL): Promise<Response> => {
      const u = String(url);
      if (u.match(/api\.github\.com\/users\/alice$/)) {
        return new Response(JSON.stringify({ login: "alice", bio: "LLM tools" }));
      }
      if (u.includes("api.github.com/users/alice/repos")) {
        return new Response(JSON.stringify([
          { full_name: "alice/infer", description: "Local inference", topics: ["llm"], language: "Rust", stargazers_count: 1, fork: false, archived: false },
        ]));
      }
      if (u.includes("api.github.com/users/") && u.includes("/starred")) {
        return new Response(JSON.stringify([
          { full_name: "rust-lang/rust", description: "x", topics: ["rust"], language: "Rust", stargazers_count: 1, fork: false, archived: false },
        ]));
      }
      if (u.includes("api.github.com/users/alice/events/public")) {
        return new Response(JSON.stringify([]));
      }
      if (u.includes("api.github.com/repos/alice/infer/readme")) {
        return new Response(JSON.stringify({ encoding: "base64", content: Buffer.from("Local inference README").toString("base64") }));
      }
      if (u.includes("github.com/trending")) return new Response(trendingHtml);
      if (u.endsWith("/chat/completions")) {
        const idx = llmCalls++;
        const content = idx <= 1 ? generatedProfile : (idx === 2 ? rankFixture : summaryFixture);
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.LLM_API_KEY = "sk-test";
    await runPipeline({ root: tmpRoot, now: new Date("2026-05-04T00:00:00Z") });

    // profile.yaml should have been auto-written
    const profileText = await readFile(path.join(tmpRoot, "config/profile.yaml"), "utf8");
    expect(profileText).toContain("# generated 2026-05-04 from alice");
    expect(profileText).toContain("LLM tooling and inference");

    // config.yaml should NOT have been modified — regenerate was already false
    const cfgAfter = await readFile(path.join(tmpRoot, "config/config.yaml"), "utf8");
    expect(cfgAfter).toBe(cfgYaml);
  });

  it("auto-generates profile.yaml when regenerate is true and flips it back", async () => {
    await mkdir(path.join(tmpRoot, "config"), { recursive: true });
    await mkdir(path.join(tmpRoot, "data/issues"), { recursive: true });
    const cfg = cfgYaml.replace("regenerate: false", "regenerate: true");
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(tmpRoot, "config/config.yaml"), cfg);
    // Pre-write a profile.yaml so ensureProfile sees regenerate=true and overwrites it.
    await fs.writeFile(path.join(tmpRoot, "config/profile.yaml"), profileYaml);

    const generatedProfile = JSON.stringify({
      version: 2,
      core_themes: [{
        name: "LLM tooling and inference",
        weight: 0.9,
        confidence: "high",
        evidence: [{ source: "owned_repo", repo: "alice/infer", note: "owned inference repo" }],
      }],
      secondary_themes: [],
      languages: [{ name: "rust", weight: 0.8, evidence_count: 1 }],
      exclude_themes: [],
      notes: "Auto-generated test profile.",
    });

    let llmCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL): Promise<Response> => {
      const u = String(url);
      if (u.match(/api\.github\.com\/users\/alice$/)) {
        return new Response(JSON.stringify({ login: "alice", bio: "LLM tools" }));
      }
      if (u.includes("api.github.com/users/alice/repos")) {
        return new Response(JSON.stringify([
          { full_name: "alice/infer", description: "Local inference", topics: ["llm"], language: "Rust", stargazers_count: 1, fork: false, archived: false },
        ]));
      }
      if (u.includes("api.github.com/users/") && u.includes("/starred")) {
        return new Response(JSON.stringify([
          { full_name: "rust-lang/rust", description: "x", topics: ["rust"], language: "Rust", stargazers_count: 1, fork: false, archived: false },
          { full_name: "tokio-rs/tokio", description: "y", topics: ["async"], language: "Rust", stargazers_count: 1, fork: false, archived: false },
        ]));
      }
      if (u.includes("api.github.com/users/alice/events/public")) {
        return new Response(JSON.stringify([]));
      }
      if (u.includes("api.github.com/repos/alice/infer/readme")) {
        return new Response(JSON.stringify({ encoding: "base64", content: Buffer.from("Local inference README").toString("base64") }));
      }
      if (u.includes("github.com/trending")) return new Response(trendingHtml);
      if (u.endsWith("/chat/completions")) {
        const idx = llmCalls++;
        const content = idx <= 1 ? generatedProfile : (idx === 2 ? rankFixture : summaryFixture);
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.LLM_API_KEY = "sk-test";
    await runPipeline({ root: tmpRoot, now: new Date("2026-05-04T00:00:00Z") });

    const profileText = await readFile(path.join(tmpRoot, "config/profile.yaml"), "utf8");
    expect(profileText).toContain("# generated 2026-05-04 from alice");
    expect(profileText).toContain("LLM tooling and inference");

    const cfgAfter = await readFile(path.join(tmpRoot, "config/config.yaml"), "utf8");
    expect(cfgAfter).toContain("regenerate: false");
    expect(cfgAfter).not.toContain("regenerate: true");
  });
});
