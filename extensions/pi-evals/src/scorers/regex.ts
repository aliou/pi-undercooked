/**
 * Regex scorer - checks that output matches a pattern
 */
import type { Expected, Scorer } from "../types";

/**
 * Creates a scorer that checks if the agent's output matches a regex pattern
 */
export function outputMatches(pattern: RegExp): Scorer<Expected> {
  return {
    name: "outputMatches",
    score: async (ctx) => {
      const matches = pattern.test(ctx.output);

      return {
        name: "outputMatches",
        score: matches ? 1 : 0,
        reason: matches
          ? `Output matches ${pattern}`
          : `Output does not match ${pattern}`,
      };
    },
  };
}
