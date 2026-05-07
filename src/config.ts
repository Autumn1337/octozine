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
  profile: z.object({ regenerate: z.boolean() }),
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

const ProfileSchema = z.object({
  themes: z.array(z.string()),
  languages: z.array(z.string()),
  exclude_themes: z.array(z.string()),
  notes: z.string(),
});

export function parseConfig(text: string): Config {
  const raw = yaml.load(text);
  const parsed = ConfigSchema.parse(raw);
  return {
    schedule: parsed.schedule,
    languages: parsed.languages,
    githubUsername: parsed.github_username,
    profile: parsed.profile,
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
    themes: parsed.themes,
    languages: parsed.languages,
    excludeThemes: parsed.exclude_themes,
    notes: parsed.notes,
  };
}
