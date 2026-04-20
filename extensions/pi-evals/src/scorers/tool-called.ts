/**
 * Tool called scorer - checks that a specific tool was called during the session
 */
import type { Expected, ScoreContext, Scorer } from "../types";

/**
 * Creates a scorer that checks if a specific tool was called.
 *
 * @param name - The tool name to check for (e.g., "read", "bash", "linkup_web_search")
 */
export function toolCalled(name: string): Scorer<Expected> {
  return {
    name: `toolCalled(${name})`,
    score: async (ctx: ScoreContext<Expected>) => {
      const called = ctx.toolCalls.some((tc) => tc.name === name);

      return {
        name: `toolCalled(${name})`,
        score: called ? 1 : 0,
        reason: called
          ? `Tool "${name}" was called`
          : `Tool "${name}" was not called. Called: ${formatToolNames(ctx)}`,
      };
    },
  };
}

function formatToolNames(ctx: ScoreContext<Expected>): string {
  if (ctx.toolCalls.length === 0) return "(none)";
  const unique = [...new Set(ctx.toolCalls.map((tc) => tc.name))];
  return unique.join(", ");
}
