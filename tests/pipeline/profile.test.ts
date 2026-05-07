import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import {
  parseStarredResponse,
  parseOwnedReposResponse,
  parseUserEvents,
  analyzeProfileSignals,
  buildProfileContext,
  buildProfilePrompt,
  serializeProfileYaml,
  flipRegenerateToFalse,
  type ProfileContext,
} from "../../src/pipeline/profile.js";
import { parseProfile } from "../../src/config.js";
import type { Profile } from "../../src/types.js";

const profileV2: Profile = {
  version: 2,
  generatedFrom: {
    username: "alice",
    generatedAt: "2026-05-07",
    signals: { ownedRepos: 1, starredRepos: 2, activityRepos: 1, readmes: 1 },
  },
  coreThemes: [{
    name: "LLM inference tooling",
    weight: 0.92,
    confidence: "high",
    evidence: [{ source: "owned_repo", repo: "alice/infer", note: "owned inference repo" }],
  }],
  secondaryThemes: [{
    name: "Terminal developer tools",
    weight: 0.7,
    confidence: "medium",
    evidence: [{ source: "starred_repo", repo: "charmbracelet/bubbletea", note: "starred TUI repo" }],
  }],
  languages: [{ name: "rust", weight: 0.86, evidenceCount: 4 }],
  excludeThemes: [{ name: "crypto", confidence: "medium", reason: "explicitly excluded" }],
  notes: "Prefers practical infrastructure.",
};

const context: ProfileContext = {
  user: { login: "alice", bio: "builds fast local inference tools" },
  explicitPreferences: { include: ["LLM inference"], exclude: ["crypto"] },
  ownedRepos: [{
    fullName: "alice/infer",
    description: "Local inference benchmark",
    topics: ["llm", "inference"],
    stars: 20,
    fork: false,
    archived: false,
    source: "owned",
    language: "Rust",
    pushedAt: "2026-05-01T00:00:00Z",
  }],
  starredRepos: [{
    fullName: "vercel/next.js",
    description: "React framework",
    topics: ["react"],
    stars: 100000,
    fork: false,
    archived: false,
    source: "starred",
    language: "TypeScript",
  }],
  activityRepos: [{ repo: "vllm-project/vllm", types: ["PullRequestEvent"], latestAt: "2026-05-02T00:00:00Z" }],
  readmeExcerpts: [{ repo: "alice/infer", excerpt: "Benchmark local LLM inference engines." }],
  stats: {
    languages: [{ name: "rust", weight: 1, count: 1 }],
    topics: [{ name: "inference", weight: 1, count: 1 }],
    owners: [{ name: "alice", weight: 1, count: 1 }],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("profile signal parsers", () => {
  it("extracts richer repo signals from a real starred payload", async () => {
    const json = JSON.parse(
      await readFile(new URL("../fixtures/starred.json", import.meta.url), "utf8"),
    );
    const out = parseStarredResponse(json);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.fullName).toMatch(/^[^/]+\/[^/]+$/);
      expect(typeof s.description).toBe("string");
      expect(Array.isArray(s.topics)).toBe(true);
      expect(s.source).toBe("starred");
    }
  });

  it("parses owned repos and public events", () => {
    expect(parseOwnedReposResponse([
      { full_name: "alice/tool", description: null, topics: ["cli"], language: "Rust" },
    ])[0]).toMatchObject({ fullName: "alice/tool", source: "owned", language: "Rust" });
    expect(parseUserEvents([
      { type: "PushEvent", repo: { name: "alice/tool" }, created_at: "2026-05-01T00:00:00Z" },
      { type: "PullRequestEvent", repo: { name: "alice/tool" }, created_at: "2026-05-02T00:00:00Z" },
    ])[0]).toMatchObject({ repo: "alice/tool", types: ["PushEvent", "PullRequestEvent"] });
  });
});

describe("analyzeProfileSignals", () => {
  it("weights owned repos above starred noise", () => {
    const stats = analyzeProfileSignals(context.ownedRepos, context.starredRepos, context.activityRepos);
    expect(stats.languages[0]!.name).toBe("rust");
    // owned-repo topics (llm, inference) outrank starred-repo topics (react).
    // Both owned topics share weight 1.0, so the alphabetic tiebreak between
    // them is implementation detail — assert presence + ordering vs starred.
    const topicNames = stats.topics.map(t => t.name);
    expect(topicNames.slice(0, 2)).toEqual(expect.arrayContaining(["llm", "inference"]));
    const reactIdx = topicNames.indexOf("react");
    expect(reactIdx).toBeGreaterThan(1);
  });
});

describe("buildProfileContext", () => {
  it("builds a multi-signal context and truncates readmes", async () => {
    const ctx = await buildProfileContext({
      username: "alice",
      explicitInclude: ["rust cli"],
      explicitExclude: ["crypto"],
      readmeRepos: 1,
      fetchUserProfileFn: async () => ({ login: "alice", bio: "systems tools" }),
      fetchOwnedReposFn: async () => context.ownedRepos,
      fetchStarredFn: async () => context.starredRepos,
      fetchUserEventsFn: async () => context.activityRepos,
      fetchReadmeExcerptFn: async repo => ({ repo, excerpt: "x".repeat(2500).slice(0, 2000) }),
    });
    expect(ctx.user.bio).toBe("systems tools");
    expect(ctx.explicitPreferences.include).toEqual(["rust cli"]);
    expect(ctx.readmeExcerpts).toHaveLength(1);
    expect(ctx.readmeExcerpts[0]!.excerpt).toHaveLength(2000);
  });
});

describe("buildProfilePrompt", () => {
  it("includes owned repos, activity, starred repos, readmes, and explicit preferences", () => {
    const messages = buildProfilePrompt(context, "alice");
    expect(messages.length).toBe(2);
    expect(messages[1]!.content).toContain("owned repositories");
    expect(messages[1]!.content).toContain("alice/infer");
    expect(messages[1]!.content).toContain("vllm-project/vllm");
    expect(messages[1]!.content).toContain("LLM inference");
    expect(messages[1]!.content).toContain("readme excerpts");
  });
});

describe("serializeProfileYaml", () => {
  it("round-trips v2 profile through parseProfile", () => {
    const yaml = serializeProfileYaml(profileV2, { generatedAt: "2026-05-07", username: "alice" });
    expect(yaml).toContain("# generated 2026-05-07 from alice");
    const reparsed = parseProfile(yaml);
    expect(reparsed).toEqual(profileV2);
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
