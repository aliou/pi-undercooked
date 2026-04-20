import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const GITHUB_MODELS_BASE_URL =
  process.env.GITHUB_MODELS_BASE_URL ?? "https://models.github.ai/inference";

const GITHUB_MODELS_API_KEY =
  process.env.GITHUB_MODELS_KEY ??
  process.env.GITHUB_TOKEN ??
  "GITHUB_MODELS_KEY";

export default function githubModelsProvider(pi: ExtensionAPI): void {
  pi.registerProvider("github-models", {
    baseUrl: GITHUB_MODELS_BASE_URL,
    apiKey: GITHUB_MODELS_API_KEY,
    api: "openai-completions",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o (GitHub Models)",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1 (GitHub Models)",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini (GitHub Models)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 400000,
        maxTokens: 16384,
      },
    ],
  });
}
