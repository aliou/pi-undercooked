/**
 * Tool called with args scorer - checks that a tool was called with specific arguments
 */
import * as path from "node:path";
import type { Expected, ScoreContext, Scorer } from "../types";

/**
 * Creates a scorer that checks if a tool was called with specific arguments.
 *
 * For `path` arguments, both expected and actual values are resolved to
 * absolute paths before comparison. All other arguments use direct equality.
 *
 * @param name - The tool name to check for
 * @param expectedArgs - Key-value pairs the tool call args must contain
 */
export function toolCalledWith(
  name: string,
  expectedArgs: Record<string, unknown>,
): Scorer<Expected> {
  const label = `toolCalledWith(${name})`;

  return {
    name: label,
    score: async (ctx: ScoreContext<Expected>) => {
      const matching = ctx.toolCalls.filter((tc) => tc.name === name);

      if (matching.length === 0) {
        return {
          name: label,
          score: 0,
          reason: `Tool "${name}" was not called. Called: ${formatToolNames(ctx)}`,
        };
      }

      // Check if any call matches all expected args
      for (const tc of matching) {
        if (argsMatch(tc.args, expectedArgs, ctx.cwd)) {
          return {
            name: label,
            score: 1,
            reason: `Tool "${name}" called with matching args`,
          };
        }
      }

      // Show the closest call for debugging
      const firstCall = matching[0];
      const mismatches = getArgMismatches(
        firstCall.args,
        expectedArgs,
        ctx.cwd,
      );

      return {
        name: label,
        score: 0,
        reason: `Tool "${name}" called ${matching.length} time(s) but args did not match. ${mismatches}`,
      };
    },
  };
}

/**
 * Check if actual args contain all expected key-value pairs.
 * Path args are resolved to absolute paths before comparison.
 */
function argsMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  cwd: string,
): boolean {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];

    if (isPathArg(key)) {
      const resolvedActual = resolvePath(actualValue, cwd);
      const resolvedExpected = resolvePath(expectedValue, cwd);
      if (resolvedActual !== resolvedExpected) return false;
    } else {
      if (!deepEqual(actualValue, expectedValue)) return false;
    }
  }

  return true;
}

/**
 * Get human-readable mismatch descriptions for debugging.
 */
function getArgMismatches(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  cwd: string,
): string {
  const parts: string[] = [];

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];

    if (isPathArg(key)) {
      const resolvedActual = resolvePath(actualValue, cwd);
      const resolvedExpected = resolvePath(expectedValue, cwd);
      if (resolvedActual !== resolvedExpected) {
        parts.push(
          `${key}: expected "${resolvedExpected}", got "${resolvedActual}"`,
        );
      }
    } else if (!deepEqual(actualValue, expectedValue)) {
      parts.push(
        `${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
      );
    }
  }

  return parts.join("; ");
}

/**
 * Check if an argument key represents a file path.
 */
function isPathArg(key: string): boolean {
  return key === "path" || key === "file" || key.endsWith("Path");
}

/**
 * Resolve a value as an absolute path relative to cwd.
 */
function resolvePath(value: unknown, cwd: string): string {
  if (typeof value !== "string") return String(value);
  return path.resolve(cwd, value);
}

/**
 * Simple deep equality for JSON-compatible values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

function formatToolNames(ctx: ScoreContext<Expected>): string {
  if (ctx.toolCalls.length === 0) return "(none)";
  const unique = [...new Set(ctx.toolCalls.map((tc) => tc.name))];
  return unique.join(", ");
}
