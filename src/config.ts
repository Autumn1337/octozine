import { z } from "zod";
import yaml from "js-yaml";
import type { Config, Profile } from "./types.js";
import { resolveLlmConfig, type ProviderName } from "./llm/providers.js";

const SourcesSchema = z.object({
  trending: z.object({
    enabled: z.boolean(),
    langs: z.array(z.string()),
    window: z.enum(["daily", "weekly", "monthly"]),
  }),
  search: z.object({
    enabled: z.boolean(),
    queries: z.array(z.string()),
  }).optional(),
  hn: z.object({
    enabled: z.boolean(),
    min_score: z.number(),
  }).optional(),
  events: z.object({
    enabled: z.boolean(),
  }).optional(),
});

const OutputsSchema = z.object({
  pages: z.object({ enabled: z.boolean() }),
  rss: z.object({ enabled: z.boolean() }).optional(),
  telegram: z.object({ enabled: z.boolean(), chat_id: z.string() }).optional(),
  email: z.object({ enabled: z.boolean(), to: z.string() }).optional(),
});

const ConfigSchema = z.object({
  schedule: z.string(),
  languages: z.array(z.enum(["zh", "en"])).min(1),
  github_username: z.string().min(1),
  profile: z.object({
    regenerate: z.boolean(),
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    readme_repos: z.number().int().nonnegative().default(8),
    starred_limit: z.number().int().positive().default(150),
    activity_limit: z.number().int().nonnegative().default(50),
  }),
  llm: z.object({
    provider: z.string().min(1).optional(),
    base_url: z.string().url().optional(),
    model: z.string().min(1).optional(),
  }),
  sources: SourcesSchema,
  outputs: OutputsSchema,
  top_n: z.number().int().positive(),
  hero_n: z.number().int().positive(),
  history_window: z.number().int().nonnegative(),
});

const EvidenceSchema = z.object({
  source: z.enum(["explicit", "profile", "owned_repo", "activity_repo", "starred_repo", "readme"]),
  repo: z.string().optional(),
  note: z.string(),
});

const ThemeSchema = z.object({
  name: z.string(),
  weight: z.number().min(0).max(1),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(EvidenceSchema).min(1),
});

// js-yaml parses unquoted ISO dates (e.g. `2026-05-07`) into Date objects, but
// the rest of the pipeline expects an ISO date string. Accept either shape so
// hand-edited profile.yaml files don't need to remember to quote the date.
const IsoDateString = z.union([
  z.string(),
  z.date().transform(d => d.toISOString().slice(0, 10)),
]);

const ProfileSchema = z.object({
  version: z.literal(2),
  generated_from: z.object({
    username: z.string(),
    generated_at: IsoDateString,
    signals: z.object({
      owned_repos: z.number().int().nonnegative(),
      starred_repos: z.number().int().nonnegative(),
      activity_repos: z.number().int().nonnegative(),
      readmes: z.number().int().nonnegative(),
    }),
  }),
  core_themes: z.array(ThemeSchema).min(1),
  secondary_themes: z.array(ThemeSchema),
  languages: z.array(z.object({
    name: z.string(),
    weight: z.number().min(0).max(1),
    evidence_count: z.number().int().nonnegative(),
  })),
  exclude_themes: z.array(z.object({
    name: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    reason: z.string(),
  })),
  notes: z.string(),
});

export function parseConfig(text: string): Config {
  const raw = yaml.load(text);
  const parsed = ConfigSchema.parse(raw);
  return {
    schedule: parsed.schedule,
    languages: parsed.languages,
    githubUsername: parsed.github_username,
    profile: {
      regenerate: parsed.profile.regenerate,
      include: parsed.profile.include,
      exclude: parsed.profile.exclude,
      readmeRepos: parsed.profile.readme_repos,
      starredLimit: parsed.profile.starred_limit,
      activityLimit: parsed.profile.activity_limit,
    },
    llm: resolveLlmConfig({
      provider: (parsed.llm.provider ?? (parsed.llm.base_url ? "custom" : "deepseek")) as ProviderName,
      ...(parsed.llm.base_url ? { baseUrl: parsed.llm.base_url } : {}),
      ...(parsed.llm.model ? { model: parsed.llm.model } : {}),
    }),
    sources: {
      trending: parsed.sources.trending,
      ...(parsed.sources.search ? { search: parsed.sources.search } : {}),
      ...(parsed.sources.hn ? { hn: { enabled: parsed.sources.hn.enabled, minScore: parsed.sources.hn.min_score } } : {}),
      ...(parsed.sources.events ? { events: parsed.sources.events } : {}),
    },
    outputs: {
      pages: parsed.outputs.pages,
      ...(parsed.outputs.rss ? { rss: parsed.outputs.rss } : {}),
      ...(parsed.outputs.telegram ? { telegram: { enabled: parsed.outputs.telegram.enabled, chatId: parsed.outputs.telegram.chat_id } } : {}),
      ...(parsed.outputs.email ? { email: parsed.outputs.email } : {}),
    },
    topN: parsed.top_n,
    heroN: parsed.hero_n,
    historyWindow: parsed.history_window,
  };
}

export function parseProfile(text: string): Profile {
  const raw = yaml.load(text);
  const parsed = ProfileSchema.parse(raw);
  return {
    version: 2,
    generatedFrom: {
      username: parsed.generated_from.username,
      generatedAt: parsed.generated_from.generated_at,
      signals: {
        ownedRepos: parsed.generated_from.signals.owned_repos,
        starredRepos: parsed.generated_from.signals.starred_repos,
        activityRepos: parsed.generated_from.signals.activity_repos,
        readmes: parsed.generated_from.signals.readmes,
      },
    },
    coreThemes: parsed.core_themes.map(t => ({
      name: t.name,
      weight: t.weight,
      confidence: t.confidence,
      evidence: t.evidence,
    })),
    secondaryThemes: parsed.secondary_themes.map(t => ({
      name: t.name,
      weight: t.weight,
      confidence: t.confidence,
      evidence: t.evidence,
    })),
    languages: parsed.languages.map(l => ({
      name: l.name,
      weight: l.weight,
      evidenceCount: l.evidence_count,
    })),
    excludeThemes: parsed.exclude_themes.map(t => ({
      name: t.name,
      confidence: t.confidence,
      reason: t.reason,
    })),
    notes: parsed.notes,
  };
}
