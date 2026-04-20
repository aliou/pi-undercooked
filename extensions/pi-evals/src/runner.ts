/**
 * Eval runner - orchestrates sequential execution
 */

import { discoverEvals } from "./discovery";
import { cleanupWorkspace, runPiTask } from "./task";
import type {
  CliOptions,
  EvalDefinition,
  EvalRunSummary,
  GlobalConfig,
  ScoreContext,
  TestResult,
} from "./types";

/**
 * Run all discovered evals
 */
export async function runEvals(
  config: Required<GlobalConfig>,
  options: CliOptions,
): Promise<EvalRunSummary> {
  const startTime = Date.now();

  // Discover eval files
  const evals = await discoverEvals(config.evalsDir);

  if (evals.length === 0) {
    return {
      results: [],
      total: 0,
      passed: 0,
      failed: 0,
      duration: Date.now() - startTime,
      totalTokens: 0,
      totalCost: 0,
    };
  }

  // Filter evals if requested
  const filterPattern = options.filter;
  const filteredEvals = filterPattern
    ? evals.filter((e) => e.name.includes(filterPattern))
    : evals;

  // Count total test cases
  const totalCases = filteredEvals.reduce(
    (sum, e) => sum + e.options.data.length,
    0,
  );

  // Warn if too many test cases
  if (totalCases > config.warnTestCount) {
    console.warn(
      `Warning: ${totalCases} test cases. This may take a while and hit rate limits.`,
    );
  }

  const results: TestResult[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  // Run evals sequentially
  for (const evalDef of filteredEvals) {
    const evalResults = await runSingleEval(evalDef, config, options);
    results.push(...evalResults);

    for (const result of evalResults) {
      totalTokens += result.tokens.total;
      totalCost += result.cost;
    }
  }

  const passed = results.filter((r) => r.passed).length;

  return {
    results,
    total: results.length,
    passed,
    failed: results.length - passed,
    duration: Date.now() - startTime,
    totalTokens,
    totalCost,
  };
}

/**
 * Run a single eval (all its test cases)
 */
async function runSingleEval(
  evalDef: EvalDefinition,
  config: Required<GlobalConfig>,
  options: CliOptions,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const { name, options: evalOptions } = evalDef;

  // Check for .only test cases
  const onlyCases = evalOptions.data.filter((tc) => tc.only);
  const testCases = onlyCases.length > 0 ? onlyCases : evalOptions.data;

  // Filter out skipped cases
  const runnableCases = testCases.filter((tc) => !tc.skip);

  for (let i = 0; i < runnableCases.length; i++) {
    const testCase = runnableCases[i];
    const startTime = Date.now();
    let cwd = "";

    try {
      // Merge config with defaults, then apply CLI/env overrides
      const mergedExtensions = [
        ...(config.defaults.extensions ?? []),
        ...(evalOptions.config.extensions ?? []),
      ];

      const piConfig = {
        ...config.defaults,
        ...evalOptions.config,
        ...(mergedExtensions.length > 0
          ? { extensions: Array.from(new Set(mergedExtensions)) }
          : {}),
        // CLI/env overrides take precedence
        ...(options.model && { model: options.model }),
        ...(options.provider && { provider: options.provider }),
      };

      // Run the pi task
      const timeout = testCase.timeout ?? evalOptions.timeout ?? config.timeout;
      const taskResult = await runPiTask(
        testCase.input,
        piConfig,
        testCase.setup,
        timeout,
      );

      cwd = taskResult.cwd; // Save for cleanup and scorers

      // Build scorer context
      const ctx: ScoreContext = {
        input: testCase.input,
        output: taskResult.output,
        expected: testCase.expected,
        cwd,
        messages: taskResult.messages as never[],
        toolCalls: taskResult.toolCalls,
        stats: taskResult.stats,
      };

      // Run all scorers
      const scores = await Promise.all(
        evalOptions.scorers.map((scorer) => scorer.score(ctx)),
      );

      // Test passes if all scores >= 0.5
      const passed = scores.every((s) => s.score >= 0.5);

      results.push({
        evalName: name,
        input: testCase.input,
        scores,
        passed,
        duration: Date.now() - startTime,
        tokens: taskResult.stats.tokens,
        cost: taskResult.stats.cost,
      });

      if (options.verbose) {
        const status = passed ? "PASS" : "FAIL";
        console.log(`  [${status}] ${truncate(testCase.input, 50)}`);
      }
    } catch (err) {
      results.push({
        evalName: name,
        input: testCase.input,
        scores: [],
        passed: false,
        duration: Date.now() - startTime,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0,
        error: (err as Error).message,
      });

      if (options.verbose) {
        console.log(`  [ERROR] ${truncate(testCase.input, 50)}`);
        console.log(`    ${(err as Error).message}`);
      }
    } finally {
      // Clean up workspace if we have one
      if (cwd) {
        await cleanupWorkspace(cwd);
      }
    }

    // Delay between tests (rate limiting)
    if (i < runnableCases.length - 1) {
      await sleep(config.delayBetweenTests);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(str: string, maxLen: number): string {
  const oneLine = str.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 3)}...`;
}
