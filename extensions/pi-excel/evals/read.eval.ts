import * as path from "node:path";
import type { Scorer } from "@aliou/pi-evals";
import { evaluate, Scorers } from "@aliou/pi-evals";

const fixturePath = path.resolve("tests/fixtures/simple.xlsx");

const mentionsData: Scorer = {
  name: "mentions_data",
  async score(ctx) {
    const output = ctx.output;
    const values = ["Alice", "Bob", "Paris", "London"];
    const found = values.filter((v) => output.includes(v));
    return {
      name: "mentions_data",
      score: found.length / values.length,
      reason: `Found ${found.length}/${values.length} expected values`,
    };
  },
};

evaluate("Read data from a sheet", {
  config: {
    extensions: ["./src/index.ts"],
  },
  data: [
    {
      input: `Read the first 2 rows from ${fixturePath}. Only show the Name and City columns.`,
    },
  ],
  scorers: [Scorers.toolCalled("excel_read"), mentionsData],
});
