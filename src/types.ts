export type Source = "trending" | "search" | "hn" | "events";

export type Candidate = {
  owner: string;
  repo: string;
  description: string;
  stars: number;
  starsDelta?: number;
  language?: string;
  topics: string[];
  url: string;
  sources: Source[];
  sourceMeta: Partial<Record<Source, Record<string, unknown>>>;
};

export type RankedCandidate = Candidate & {
  score: number;   // 0-100
  reason: string;  // single zh sentence explaining why it ranks here
};

export type Summary = { zh: string; en: string };

export type SummarizedItem = RankedCandidate & {
  summary: Summary;
};

export type Profile = {
  themes: string[];
  languages: string[];
  excludeThemes: string[];
  notes: string;
};

export type Config = {
  schedule: string;            // "weekly" | "daily" | cron expression
  languages: ("zh" | "en")[];
  githubUsername: string;
  profile: { regenerate: boolean };
  llm: { baseUrl: string; model: string };
  sources: {
    trending: { enabled: boolean; langs: string[]; window: "daily" | "weekly" | "monthly" };
    search?: { enabled: boolean; queries: string[] };
    hn?: { enabled: boolean; minScore: number };
    events?: { enabled: boolean };
  };
  outputs: {
    pages: { enabled: boolean };
    rss?: { enabled: boolean };
    telegram?: { enabled: boolean; chatId: string };
    email?: { enabled: boolean; to: string };
  };
  topN: number;
  heroN: number;
  historyWindow: number;
};

export type IssueData = {
  slug: string;            // e.g. "2026-W18"
  generatedAt: string;     // ISO 8601
  hero: SummarizedItem;
  items: SummarizedItem[]; // excluding hero
  meta: {
    config: { schedule: string; languages: ("zh" | "en")[] };
    profile: Profile;
    sourceCounts: Partial<Record<Source, number>>;
  };
};
