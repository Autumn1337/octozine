import type { IssueData, SummarizedItem, Profile, Config, Source } from "../types.js";

export type BuildOpts = {
  config: Config;
  profile: Profile;
  items: SummarizedItem[];
  generatedAt?: Date;
};

export function buildIssue(opts: BuildOpts): IssueData {
  if (opts.items.length === 0) {
    throw new Error("buildIssue: empty items list");
  }
  if (opts.config.heroN !== 1) {
    console.warn(`buildIssue: heroN=${opts.config.heroN} not yet supported; using 1`);
  }
  const now = opts.generatedAt ?? new Date();
  const slug = slugForDate(now);
  const hero = opts.items[0]!;
  const restItems = opts.items.slice(1);
  const sourceCounts: Partial<Record<Source, number>> = {};
  for (const item of opts.items) {
    for (const s of item.sources) {
      sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
    }
  }
  return {
    slug,
    generatedAt: now.toISOString(),
    hero,
    items: restItems,
    meta: {
      config: { schedule: opts.config.schedule, languages: opts.config.languages },
      profile: opts.profile,
      sourceCounts,
    },
  };
}

export function slugForDate(d: Date): string {
  const year = isoWeekYear(d);
  const week = isoWeekNumber(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

function isoWeekYear(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  return target.getUTCFullYear();
}
