/**
 * Eval: verify that extensions are loaded and their tools are available.
 *
 * Loads a dummy "ping" extension that registers a `ping` tool, then asks the
 * agent to use it. The scorer checks that the tool was actually called.
 */
import { evaluate } from "../src/index";
import type { Scorer } from "../src/types";

const usesPingTool: Scorer = {
  name: "uses_ping_tool",
  async score({ toolCalls }) {
    const called = toolCalls.some((tc) => tc.name === "ping");
    return {
      name: "uses_ping_tool",
      score: called ? 1 : 0,
      reason: called
        ? "Agent called the ping tool"
        : "Agent did not call the ping tool",
    };
  },
};

evaluate("Extension loading - ping tool", {
  config: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    extensions: ["./evals/fixtures/ping-extension.ts"],
  },
  data: [
    {
      input:
        'You have a tool called "ping". Call it now and tell me the result.',
    },
  ],
  scorers: [usesPingTool],
  timeout: 30_000,
});
