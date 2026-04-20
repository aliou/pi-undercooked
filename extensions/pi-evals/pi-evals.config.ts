/**
 * pi-eval configuration
 */
import { defineConfig } from "./src/index.js";

export default defineConfig({
  // Default Pi configuration (can be overridden per eval)
  defaults: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
  },

  // Directory containing eval files
  evalsDir: "./evals",

  // Delay between test cases (ms) - helps with rate limits
  delayBetweenTests: 500,

  // Default timeout per test (ms)
  timeout: 60_000,

  // Warn if more than this many test cases
  warnTestCount: 30,
});
