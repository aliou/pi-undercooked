/**
 * Example eval: Create a hello file
 */
import { evaluate, Scorers } from "../src/index";

evaluate("Create hello file", {
  config: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
  },
  data: [
    {
      input: 'Create a file called hello.txt containing "Hello World"',
      expected: {
        files: { "hello.txt": "Hello World" },
      },
    },
    {
      input: 'Create a file called greeting.txt with the text "Good morning"',
      expected: {
        files: { "greeting.txt": "Good morning" },
      },
    },
  ],
  scorers: [Scorers.files()],
  timeout: 30_000,
});
