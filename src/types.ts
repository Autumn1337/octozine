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
  matchedThemes: string[];
  matchedLanguages: string[];
};

export type Summary = { zh: string; en: string };

export type SummarizedItem = RankedCandidate & {
  summary: Summary;
};

export type ProfileEvidence = {
  source: "explicit" | "profile" | "owned_repo" | "activity_repo" | "starred_repo" | "readme";
  repo?: string;
  note: string;
};

export type ProfileTheme = {
  name: string;
  weight: number;
  confidence: "low" | "medium" | "high";
  evidence: ProfileEvidence[];
};

export type ProfileLanguage = {
  name: string;
  weight: number;
  evidenceCount: number;
};

export type ProfileExcludeTheme = {
  name: string;
  confidence: "low" | "medium" | "high";
  reason: string;
};

export type Profile = {
  version: 2;
  generatedFrom: {
    username: string;
    generatedAt: string;
    signals: {
      ownedRepos: number;
      starredRepos: number;
      activityRepos: number;
      readmes: number;
    };
  };
  coreThemes: ProfileTheme[];
  secondaryThemes: ProfileTheme[];
  languages: ProfileLanguage[];
  excludeThemes: ProfileExcludeTheme[];
  notes: string;
};

export type Config = {
  schedule: string;            // "weekly" | "daily" | cron expression
  languages: ("zh" | "en")[];
  githubUsername: string;
  profile: {
    regenerate: boolean;
    include: string[];
    exclude: string[];
    readmeRepos: number;
    starredLimit: number;
    activityLimit: number;
  };
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
