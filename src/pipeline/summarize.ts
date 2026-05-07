import type { RankedCandidate, SummarizedItem, Summary } from "../types.js";
import { chat } from "../llm/openai-compatible.js";

export type SummarizeLLMOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const SYSTEM_PROMPT = `Generate a bilingual (zh-CN + en) summary of a GitHub project.
Each language: 50–80 characters (zh) or 50–80 words (en), one paragraph, no bullets, no markdown.
Cover: what the project does, key comparison or replacement (if any), and one notable feature.
Output strict JSON: { "zh": "<sentence>", "en": "<sentence>" }`;

export async function summarizeOne(c: RankedCandidate, llm: SummarizeLLMOpts): Promise<SummarizedItem> {
  const user = [
    `name: ${c.owner}/${c.repo}`,
    `description: ${c.description || "(no description)"}`,
    `language: ${c.language ?? "unknown"}`,
    `topics: ${c.topics.join(", ") || "(none)"}`,
    `stars: ${c.stars}`,
  ].join("\n");
  const text = await chat({
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    responseFormat: "json",
  });
  const summary = JSON.parse(text) as Summary;
  if (typeof summary.zh !== "string" || typeof summary.en !== "string") {
    throw new Error(`summarize: invalid response shape: ${text.slice(0, 200)}`);
  }
  return { ...c, summary };
}

export async function summarizeAll(
  items: RankedCandidate[],
  llm: SummarizeLLMOpts,
  concurrency = 3,
): Promise<SummarizedItem[]> {
  const out: SummarizedItem[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await summarizeOneWithRetry(items[idx]!, llm);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return out;
}

async function summarizeOneWithRetry(c: RankedCandidate, llm: SummarizeLLMOpts): Promise<SummarizedItem> {
  try {
    return await summarizeOne(c, llm);
  } catch (e) {
    return await summarizeOne(c, llm);  // single retry, then bubble
  }
}
