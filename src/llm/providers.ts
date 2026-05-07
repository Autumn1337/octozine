// Defaults verified against each provider's official docs (May 2026).
// Users override with `model:` in config.yaml; see README provider table for current alternatives.
export const PROVIDERS = {
  openai:   { baseUrl: "https://api.openai.com/v1",                          model: "gpt-5.4-mini" },        // OpenAI's current cheap-fast tier; gpt-4o-mini is deprecated
  deepseek: { baseUrl: "https://api.deepseek.com",                           model: "deepseek-v4-flash" },
  moonshot: { baseUrl: "https://api.moonshot.cn/v1",                         model: "moonshot-v1-128k" },
  qwen:     { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",  model: "qwen-plus" },           // legacy alias, still active in OpenAI-compat mode
  zhipu:    { baseUrl: "https://open.bigmodel.cn/api/paas/v4",               model: "glm-4.5-air" },         // glm-4.5 itself is being deprecated; -air remains
  groq:     { baseUrl: "https://api.groq.com/openai/v1",                     model: "llama-3.1-8b-instant" },
  ollama:   { baseUrl: "http://localhost:11434/v1",                          model: "llama3.1" },
} as const;

export type ProviderName = keyof typeof PROVIDERS | "custom";

export type LlmConfigInput = {
  provider: ProviderName;
  baseUrl?: string;
  model?: string;
};

export type LlmConfigResolved = {
  baseUrl: string;
  model: string;
};

export function resolveLlmConfig(input: LlmConfigInput): LlmConfigResolved {
  if (input.provider === "custom") {
    if (!input.baseUrl || !input.model) {
      const missing: string[] = [];
      if (!input.baseUrl) missing.push("baseUrl");
      if (!input.model) missing.push("model");
      throw new Error(`provider "custom" requires explicit ${missing.join(" and ")} in config.yaml`);
    }
    return { baseUrl: input.baseUrl, model: input.model };
  }
  const preset = PROVIDERS[input.provider as keyof typeof PROVIDERS];
  if (!preset) {
    const known = ["custom", ...Object.keys(PROVIDERS)].sort().join(", ");
    throw new Error(`unknown provider "${input.provider}". Known providers: ${known}`);
  }
  return {
    baseUrl: input.baseUrl ?? preset.baseUrl,
    model: input.model ?? preset.model,
  };
}
