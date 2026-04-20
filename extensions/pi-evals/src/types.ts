/**
 * Core type definitions for pi-eval
 */

/**
 * Message from the agent conversation.
 * We use unknown since we just pass these through to scorers.
 */
export type Message = unknown;

/**
 * Pi configuration for running evals
 */
export interface PiConfig {
  model: string;
  provider: string;
  extensions?: string[];
  env?: Record<string, string>;
}

/**
 * Global configuration loaded from pi-eval.config.ts
 */
export interface GlobalConfig {
  /** Default Pi configuration */
  defaults?: Partial<PiConfig>;
  /** Directory containing eval files (default: ./evals) */
  evalsDir?: string;
  /** Delay between test cases in ms (default: 500) */
  delayBetweenTests?: number;
  /** Default timeout per test in ms (default: 60000) */
  timeout?: number;
  /** Warn if more than this many test cases (default: 30) */
  warnTestCount?: number;
}

/**
 * Setup configuration for test workspace
 */
export interface TestSetup {
  /** Files to create in workspace before running */
  files?: Record<string, string>;
  /** Shell commands to run before the eval */
  commands?: string[];
}

/**
 * Expected outcome for scoring
 */
export interface Expected {
  /** Expected files and their content (substring match) */
  files?: Record<string, string>;
  /** Expected substring in output */
  output?: string;
}

/**
 * A single test case
 */
export interface TestCase<TExpected = Expected> {
  /** Prompt to send to pi */
  input: string;
  /** Expected outcome for scorers */
  expected?: TExpected;
  /** Optional workspace setup */
  setup?: TestSetup;
  /** Run only this test case */
  only?: boolean;
  /** Skip this test case */
  skip?: boolean;
  /** Override timeout for this case */
  timeout?: number;
}

/**
 * Token usage statistics
 */
export interface TokenStats {
  input: number;
  output: number;
  total: number;
}

/**
 * Session statistics from pi
 */
export interface SessionStats {
  tokens: TokenStats;
  cost: number;
}

/**
 * A tool call captured from the session
 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Context passed to scorers
 */
export interface ScoreContext<TExpected = Expected> {
  /** Original input prompt */
  input: string;
  /** Agent's final response text */
  output: string;
  /** Expected outcome */
  expected?: TExpected;
  /** Workspace directory */
  cwd: string;
  /** Full conversation messages */
  messages: Message[];
  /** Tool calls made during the session */
  toolCalls: ToolCall[];
  /** Token and cost stats */
  stats: SessionStats;
}

/**
 * Result from a scorer
 */
export interface ScoreResult {
  /** Scorer name */
  name: string;
  /** Score from 0-1 */
  score: number;
  /** Explanation of the score */
  reason?: string;
}

/**
 * A scorer (evaluator) function
 */
export interface Scorer<TExpected = Expected> {
  /** Display name */
  name: string;
  /** Scoring function */
  score: (ctx: ScoreContext<TExpected>) => Promise<ScoreResult>;
}

/**
 * Options for defining an eval
 */
export interface EvalOptions<TExpected = Expected> {
  /** Pi configuration */
  config: PiConfig;
  /** Test cases */
  data: TestCase<TExpected>[];
  /** Scorers to run */
  scorers: Scorer<TExpected>[];
  /** Timeout per test case in ms */
  timeout?: number;
}

/**
 * Internal representation of a registered eval
 */
export interface EvalDefinition<TExpected = Expected> {
  /** Eval name */
  name: string;
  /** Eval options */
  options: EvalOptions<TExpected>;
  /** Source file path */
  file: string;
}

/**
 * Result of a single test case
 */
export interface TestResult {
  /** Eval name */
  evalName: string;
  /** Test input */
  input: string;
  /** Score results from all scorers */
  scores: ScoreResult[];
  /** Whether the test passed (all scores >= 0.5) */
  passed: boolean;
  /** Duration in ms */
  duration: number;
  /** Token usage */
  tokens: TokenStats;
  /** Cost in USD */
  cost: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Summary of an eval run
 */
export interface EvalRunSummary {
  /** All test results */
  results: TestResult[];
  /** Total tests */
  total: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Total duration in ms */
  duration: number;
  /** Total tokens used */
  totalTokens: number;
  /** Total cost in USD */
  totalCost: number;
}

/**
 * CLI options
 */
export interface CliOptions {
  /** Filter evals by name substring */
  filter?: string;
  /** Output JSON instead of pretty print */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Minimum pass percentage to exit 0 */
  threshold?: number;
  /** Config file path */
  config?: string;
  /** Override model */
  model?: string;
  /** Override provider */
  provider?: string;
}
