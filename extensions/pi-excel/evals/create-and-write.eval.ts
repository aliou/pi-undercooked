import type { Scorer } from "@aliou/pi-evals";
import { evaluate, Scorers } from "@aliou/pi-evals";

const verifyFile: Scorer = {
  name: "verify_file",
  async score(ctx) {
    const toolCalls = ctx.toolCalls;

    const created = toolCalls.some((tc) => tc.name === "excel_create");
    const addedRows = toolCalls.some((tc) => tc.name === "excel_add_rows");
    const wrote = toolCalls.some((tc) => tc.name === "excel_write");

    const steps = [created, addedRows, wrote].filter(Boolean).length;
    return {
      name: "verify_file",
      score: steps / 3,
      reason: `Completed ${steps}/3 steps: create=${created}, add_rows=${addedRows}, write=${wrote}`,
    };
  },
};

evaluate("Create, populate, and update a workbook", {
  config: {
    extensions: ["./src/index.ts"],
  },
  data: [
    {
      input: [
        "Do the following steps:",
        '1. Create an Excel file at ./inventory.xlsx with a sheet called "Items" and columns: Name, Quantity, Price',
        "2. Add these rows: Widget (10, 9.99), Gadget (5, 24.99), Bolt (100, 0.50)",
        "3. Update the Gadget quantity to 8",
      ].join("\n"),
    },
  ],
  scorers: [
    Scorers.toolCalled("excel_create"),
    Scorers.toolCalled("excel_add_rows"),
    Scorers.toolCalled("excel_write"),
    verifyFile,
  ],
  timeout: 90_000,
});
