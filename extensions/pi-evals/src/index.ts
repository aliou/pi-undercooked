/**
 * pi-eval - Eval framework for pi coding agent
 */

// Main API
export { defineConfig } from "./config";

// Scorers namespace
import * as ScorersModule from "./scorers/index";
export const Scorers = ScorersModule;

// Re-export scorer option types
export type { BashOptions, LlmJudgeOptions } from "./scorers/index";
// Types
export type {
  CliOptions,
  EvalDefinition,
  EvalOptions,
  EvalRunSummary,
  Expected,
  GlobalConfig,
  PiConfig,
  ScoreContext,
  ScoreResult,
  Scorer,
  SessionStats,
  TestCase,
  TestResult,
  TestSetup,
  TokenStats,
  ToolCall,
} from "./types";

import { getCurrentFile, registerEval } from "./discovery";
import type { EvalOptions, Expected } from "./types";

/**
 * Define and register an eval.
 * This is the main API for creating evals.
 *
 * @example
 * ```typescript
 * import { evaluate, Scorers } from "@aliou/pi-evals";
 *
 * evaluate("Create hello file", {
 *   config: {
 *     model: "claude-sonnet-4-20250514",
 *     provider: "anthropic",
 *   },
 *   data: [
 *     {
 *       input: 'Create a file called hello.txt containing "Hello World"',
 *       expected: { files: { "hello.txt": "Hello World" } },
 *     },
 *   ],
 *   scorers: [Scorers.files()],
 * });
 * ```
 */
export function evaluate<TExpected = Expected>(
  name: string,
  options: EvalOptions<TExpected>,
): void {
  const file = getCurrentFile() || "unknown";
  registerEval(name, options, file);
}
