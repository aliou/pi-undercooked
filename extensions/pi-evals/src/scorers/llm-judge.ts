/**
 * LLM Judge scorer - uses an LLM to evaluate the output
 */
import type { Expected, Scorer } from "../types";

export interface LlmJudgeOptions {
  /** Criteria for the LLM to evaluate against */
  criteria: string;
  /** Model to use (default: gpt-4o-mini) */
  model?: string;
  /** Provider (default: openai) */
  provider?: string;
}

/**
 * Creates a scorer that uses an LLM to evaluate the output against criteria.
 * Uses a cheap, fast model by default.
 *
 * Note: Requires OPENAI_API_KEY or appropriate provider API key.
 */
export function llmJudge(options: LlmJudgeOptions): Scorer<Expected> {
  const { criteria, model = "gpt-4o-mini", provider = "openai" } = options;

  return {
    name: "llmJudge",
    score: async (ctx) => {
      const prompt = buildJudgePrompt(criteria, ctx.input, ctx.output);

      try {
        const result = await callLlm(prompt, model, provider);
        return parseJudgeResponse(result);
      } catch (err) {
        return {
          name: "llmJudge",
          score: 0,
          reason: `LLM judge error: ${(err as Error).message}`,
        };
      }
    },
  };
}

function buildJudgePrompt(
  criteria: string,
  input: string,
  output: string,
): string {
  return `You are evaluating an AI coding assistant's response.

## Task given to the assistant
${input}

## Assistant's response
${output}

## Evaluation criteria
${criteria}

## Instructions
Evaluate the response against the criteria. Respond with a JSON object:
{
  "score": <number from 0 to 1>,
  "reason": "<brief explanation>"
}

Score meanings:
- 1.0: Fully meets criteria
- 0.7-0.9: Mostly meets criteria with minor issues
- 0.4-0.6: Partially meets criteria
- 0.1-0.3: Barely meets criteria
- 0.0: Does not meet criteria

Respond ONLY with the JSON object, no other text.`;
}

async function callLlm(
  prompt: string,
  model: string,
  provider: string,
): Promise<string> {
  if (provider === "openai") {
    return callOpenAI(prompt, model);
  } else if (provider === "anthropic") {
    return callAnthropic(prompt, model);
  } else {
    throw new Error(`Unsupported LLM judge provider: ${provider}`);
  }
}

async function callOpenAI(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
  };
  const textBlock = data.content.find((c) => c.type === "text");
  return textBlock?.text ?? "";
}

function parseJudgeResponse(response: string): {
  name: string;
  score: number;
  reason?: string;
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      score: number;
      reason?: string;
    };

    if (
      typeof parsed.score !== "number" ||
      parsed.score < 0 ||
      parsed.score > 1
    ) {
      throw new Error("Invalid score in response");
    }

    return {
      name: "llmJudge",
      score: parsed.score,
      reason: parsed.reason,
    };
  } catch (err) {
    return {
      name: "llmJudge",
      score: 0,
      reason: `Failed to parse judge response: ${(err as Error).message}`,
    };
  }
}
