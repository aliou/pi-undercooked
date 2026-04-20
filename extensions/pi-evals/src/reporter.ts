/**
 * Reporter - console and JSON output
 */
import type { EvalRunSummary } from "./types";

/**
 * Print results to console in a human-readable format
 */
export function printResults(summary: EvalRunSummary): void {
  const { results, total, passed, duration, totalTokens, totalCost } = summary;

  if (total === 0) {
    console.log("No eval results.");
    return;
  }

  console.log();

  // Group results by eval name
  const byEval = groupBy(results, (r) => r.evalName);

  for (const [evalName, evalResults] of Object.entries(byEval)) {
    const evalPassed = evalResults.filter((r) => r.passed).length;
    const evalTotal = evalResults.length;
    const _evalStatus = evalPassed === evalTotal ? "PASS" : "FAIL";
    const statusIcon = evalPassed === evalTotal ? "+" : "-";

    console.log(`${statusIcon} ${evalName} (${evalPassed}/${evalTotal})`);

    for (const result of evalResults) {
      const icon = result.passed ? "+" : "-";
      const time = formatDuration(result.duration);
      const cost = formatCost(result.cost);
      const tokens = result.tokens.total;

      console.log(
        `  ${icon} ${truncate(result.input, 50)} (${time}, ${cost}, ${tokens} tok)`,
      );

      // Show score details
      for (const score of result.scores) {
        const scoreIcon = score.score >= 0.5 ? "+" : "-";
        const scoreValue = (score.score * 100).toFixed(0);
        console.log(`    ${scoreIcon} ${score.name}: ${scoreValue}%`);
        if (score.reason && score.score < 1) {
          // Show reason for partial/failed scores
          const reasonLines = score.reason.split("\n").slice(0, 3);
          for (const line of reasonLines) {
            console.log(`      ${line}`);
          }
        }
      }

      // Show error if present
      if (result.error) {
        console.log(`    ! Error: ${result.error}`);
      }
    }

    console.log();
  }

  // Summary line
  console.log("─".repeat(50));
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(0) : 0;
  console.log(`Results: ${passed}/${total} passed (${passRate}%)`);
  console.log(
    `Total: ${formatCost(totalCost)}, ${totalTokens} tokens, ${formatDuration(duration)}`,
  );
}

/**
 * Print results as JSON
 */
export function printJson(summary: EvalRunSummary): void {
  console.log(JSON.stringify(summary, null, 2));
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m${remainingSeconds}s`;
}

/**
 * Format cost in USD
 */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLen: number): string {
  const oneLine = str.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 3)}...`;
}

/**
 * Group array items by key
 */
function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
