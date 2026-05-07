import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import * as path from "node:path";
import { parseConfig } from "./config.js";
import { fetchTrending } from "./fetchers/trending.js";
import { fetchSearch } from "./fetchers/search.js";
import { fetchHn } from "./fetchers/hn.js";
import { fetchEvents } from "./fetchers/events.js";
import { dedupCandidates } from "./pipeline/dedup.js";
import { filterByHistory, updateSeen, type SeenMap } from "./pipeline/history.js";
import { ensureProfile } from "./pipeline/profile.js";
import { rankCandidates } from "./pipeline/rank.js";
import { summarizeAll } from "./pipeline/summarize.js";
import { buildIssue } from "./render/build-issue.js";
import type { Candidate, IssueData, Source } from "./types.js";

export type RunOpts = {
  root?: string;
  now?: Date;
};

type FetcherEntry = { source: Source; run: () => Promise<Candidate[]> };
type FetchResult = { source: Source; items: Candidate[]; error?: unknown };

export async function runPipeline(opts: RunOpts = {}): Promise<IssueData> {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? new Date();

  const cfgText = await readFile(path.join(root, "config/config.yaml"), "utf8");
  const config = parseConfig(cfgText);

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY env var is required");
  const ghToken = process.env.GH_TOKEN;

  // 0. ensure profile (auto-generate on first run or when regenerate flag is set)
  const profile = await ensureProfile({
    root,
    username: config.githubUsername,
    regenerate: config.profile.regenerate,
    llm: { baseUrl: config.llm.baseUrl, apiKey, model: config.llm.model },
    ...(ghToken ? { ghToken } : {}),
    now,
  });

  // 1. fetch — parallel, partial failure tolerant
  const enabled: FetcherEntry[] = [];
  if (config.sources.trending.enabled) {
    enabled.push({
      source: "trending",
      run: () => fetchTrending({
        langs: config.sources.trending.langs,
        window: config.sources.trending.window,
      }),
    });
  }
  if (config.sources.search?.enabled) {
    enabled.push({
      source: "search",
      run: () => fetchSearch({
        queries: config.sources.search!.queries,
        now,
        ...(ghToken ? { token: ghToken } : {}),
      }),
    });
  }
  if (config.sources.hn?.enabled) {
    enabled.push({
      source: "hn",
      run: () => fetchHn({
        minScore: config.sources.hn!.minScore,
        ...(ghToken ? { token: ghToken } : {}),
      }),
    });
  }
  if (config.sources.events?.enabled) {
    if (!ghToken) {
      console.warn("[fetch] events enabled but GH_TOKEN missing; skipping events");
    } else {
      enabled.push({
        source: "events",
        run: () => fetchEvents({ username: config.githubUsername, token: ghToken }),
      });
    }
  }

  if (enabled.length === 0) throw new Error("no sources enabled; aborting");

  const settled = await Promise.allSettled(enabled.map(e => e.run()));
  const fetchResults: FetchResult[] = settled.map((r, i) => {
    const source = enabled[i]!.source;
    if (r.status === "fulfilled") return { source, items: r.value };
    console.warn(`[fetch] ${source} failed:`, (r.reason as Error)?.message ?? r.reason);
    return { source, items: [], error: r.reason };
  });

  const surviving = fetchResults.filter(r => !r.error);
  const requiredSurvivors = Math.min(2, enabled.length);
  if (surviving.length < requiredSurvivors) {
    throw new Error(
      `only ${surviving.length}/${enabled.length} fetchers survived; require >= ${requiredSurvivors}; aborting`,
    );
  }
  const allCandidates = surviving.flatMap(r => r.items);

  // 2a. cross-source dedup
  const deduped = dedupCandidates(allCandidates);
  if (deduped.length === 0) throw new Error("dedup: zero candidates; aborting");

  // 2b. history dedup
  const seenPath = path.join(root, "data/seen.json");
  let seen: SeenMap = {};
  try {
    seen = JSON.parse(await readFile(seenPath, "utf8")) as SeenMap;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const recentSlugs = await listRecentIssueSlugs(
    path.join(root, "data/issues"),
    config.historyWindow,
  );
  const fresh = filterByHistory(deduped, seen, recentSlugs);
  if (fresh.length === 0) throw new Error("history dedup: zero fresh candidates; aborting");

  // 3. rank
  const ranked = await rankCandidates(fresh, profile, config.topN, {
    baseUrl: config.llm.baseUrl,
    apiKey,
    model: config.llm.model,
  });

  // 4. summarize
  const summarized = await summarizeAll(ranked, {
    baseUrl: config.llm.baseUrl,
    apiKey,
    model: config.llm.model,
  });

  // 5. build issue
  const issue = buildIssue({ config, profile, items: summarized, generatedAt: now });

  // 6. update seen.json BEFORE writing the issue file. If the process is killed
  // between these two writes, dropping the issue (no .json exists yet) is recoverable
  // — next run regenerates it. The opposite order (issue exists, seen.json stale)
  // would cause the same repos to be recommended again next run.
  const issuesDir = path.join(root, "data/issues");
  await mkdir(issuesDir, { recursive: true });
  const issueRepoKeys = [issue.hero, ...issue.items].map(i => ({ owner: i.owner, repo: i.repo }));
  const nextSeen = updateSeen(seen, issue.slug, issueRepoKeys);
  await writeFile(seenPath, JSON.stringify(nextSeen, null, 2) + "\n", "utf8");
  console.log(`Updated ${seenPath}`);

  // 7. write issue file
  const out = path.join(issuesDir, `${issue.slug}.json`);
  await writeFile(out, JSON.stringify(issue, null, 2) + "\n", "utf8");
  console.log(`Wrote ${out}`);

  return issue;
}

async function listRecentIssueSlugs(dir: string, n: number): Promise<string[]> {
  if (n <= 0) return [];
  let names: string[];
  try { names = await readdir(dir); } catch { return []; }
  const slugs = names
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
  return slugs.slice(0, n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
