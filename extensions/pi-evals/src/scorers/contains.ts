/**
 * Output contains scorer - checks that output contains expected substring
 */
import type { Expected, ScoreContext, Scorer } from "../types";

/**
 * Creates a scorer that checks if the agent's output contains expected.output
 */
export function outputContains(): Scorer<Expected> {
  return {
    name: "outputContains",
    score: async (ctx: ScoreContext<Expected>) => {
      const expectedOutput = ctx.expected?.output;

      if (!expectedOutput) {
        return {
          name: "outputContains",
          score: 1,
          reason: "No output expected",
        };
      }

      const contains = ctx.output.includes(expectedOutput);

      return {
        name: "outputContains",
        score: contains ? 1 : 0,
        reason: contains
          ? `Output contains "${truncate(expectedOutput, 50)}"`
          : `Output missing "${truncate(expectedOutput, 50)}"`,
      };
    },
  };
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 3)}...`;
}
