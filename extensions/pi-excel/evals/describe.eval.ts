import * as path from "node:path";
import type { Scorer } from "@aliou/pi-evals";
import { evaluate, Scorers } from "@aliou/pi-evals";

const fixturePath = path.resolve("tests/fixtures/multi-sheet.xlsx");

const mentionsSheets: Scorer = {
  name: "mentions_sheets",
  async score(ctx) {
    const output = ctx.output.toLowerCase();
    const found = ["products", "orders"].filter((s) => output.includes(s));
    return {
      name: "mentions_sheets",
      score: found.length / 2,
      reason: `Found ${found.length}/2 sheet names: ${found.join(", ")}`,
    };
  },
};

const mentionsColumns: Scorer = {
  name: "mentions_columns",
  async score(ctx) {
    const output = ctx.output.toLowerCase();
    const cols = [
      "product",
      "price",
      "category",
      "orderid",
      "quantity",
      "total",
    ];
    const found = cols.filter((c) => output.includes(c));
    const score = found.length / cols.length;
    return {
      name: "mentions_columns",
      score,
      reason: `Found ${found.length}/${cols.length} columns`,
    };
  },
};

evaluate("Describe a workbook", {
  config: {
    extensions: ["./src/index.ts"],
  },
  data: [
    {
      input: `Describe the Excel file at ${fixturePath}. Tell me the sheet names, row counts, and column details.`,
    },
  ],
  scorers: [
    Scorers.toolCalled("excel_describe"),
    mentionsSheets,
    mentionsColumns,
  ],
});
