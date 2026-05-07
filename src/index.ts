import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { parseConfig, parseProfile } from "./config.js";
import { fetchTrending } from "./fetchers/trending.js";
import { dedupCandidates } from "./pipeline/dedup.js";
import { rankCandidates } from "./pipeline/rank.js";
import { summarizeAll } from "./pipeline/summarize.js";
import { buildIssue } from "./render/build-issue.js";
import type { Candidate, Config, IssueData, Profile, Source } from "./types.js";

export type RunOpts = {
  root?: string;       // project root, default cwd
  now?: Date;          // override clock for testing
};

export async function runPipeline(opts: RunOpts = {}): Promise<IssueData> {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? new Date();

  const cfgText = await readFile(path.join(root, "config/config.yaml"), "utf8");
  const profText = await readFile(path.join(root, "config/profile.yaml"), "utf8");
  const config: Config = parseConfig(cfgText);
  const profile: Profile = parseProfile(profText);

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY env var is required");

  // 1. fetch
  const fetchResults: { source: Source; items: Candidate[]; error?: unknown }[] = [];
  if (config.sources.trending.enabled) {
    try {
      const items = await fetchTrending({
        langs: config.sources.trending.langs,
        window: config.sources.trending.window,
      });
      fetchResults.push({ source: "trending", items });
    } catch (e) {
      console.warn(`[fetch] trending failed:`, (e as Error).message);
      fetchResults.push({ source: "trending", items: [], error: e });
    }
  }
  const surviving = fetchResults.filter(r => !r.error);
  if (surviving.length < 1) {
    // M1-M3: only trending. We require >=1 surviving source. (M4 raises to 2.)
    throw new Error("no surviving fetcher; aborting");
  }
  const allCandidates = surviving.flatMap(r => r.items);

  // 2. dedup
  const deduped = dedupCandidates(allCandidates);
  if (deduped.length === 0) throw new Error("dedup: zero candidates; aborting");

  // 3. rank
  const ranked = await rankCandidates(deduped, profile, config.topN, {
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

  // 6. write
  const issuesDir = path.join(root, "data/issues");
  await mkdir(issuesDir, { recursive: true });
  const out = path.join(issuesDir, `${issue.slug}.json`);
  await writeFile(out, JSON.stringify(issue, null, 2) + "\n", "utf8");
  console.log(`Wrote ${out}`);

  return issue;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
