import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { writeToSheet } from "../utils/excel";

const WriteOperation = Type.Object({
  row: Type.Number({
    description: "Data row number (1-indexed, excluding header)",
  }),
  column: Type.String({ description: "Column name (must match a header)" }),
  value: Type.Any({
    description: "New cell value (string, number, boolean, or null)",
  }),
});

const parameters = Type.Object({
  path: Type.String({ description: "Absolute path to the Excel (.xlsx) file" }),
  sheet: Type.Optional(
    Type.String({ description: "Sheet name. Defaults to the first sheet." }),
  ),
  operations: Type.Array(WriteOperation, {
    description:
      "List of cell updates. Each specifies a row, column, and new value.",
  }),
});

export async function executeWrite(params: {
  path: string;
  sheet?: string;
  operations: { row: number; column: string; value: unknown }[];
}) {
  const result = await writeToSheet(
    params.path,
    params.sheet,
    params.operations,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `Updated ${result.updatedCells} cell(s) in ${params.path}`,
      },
    ],
    details: {
      updatedCells: result.updatedCells,
      operations: params.operations,
    },
  };
}

export function registerWriteTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "excel_write",
    label: "Excel: Write",
    description:
      "Update specific cells in an Excel sheet. Provide a list of {row, column, value} operations. Row numbers are 1-indexed data rows (excluding the header). Use excel_describe or excel_read first to understand the structure.",
    parameters,

    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: unknown,
    ) {
      return executeWrite(params);
    },

    renderCall(args: Static<typeof parameters>, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("Excel: Write "));
      text += theme.fg("accent", args.path);
      if (args.sheet) text += theme.fg("dim", ` [${args.sheet}]`);
      text += theme.fg("dim", ` (${args.operations.length} cell(s))`);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<unknown>,
      { expanded, isPartial }: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (isPartial) return new Text(theme.fg("dim", "Writing..."), 0, 0);

      const details = result.details as {
        updatedCells?: number;
        operations?: Array<{ row: number; column: string; value: unknown }>;
      };
      if (!details) return new Text("", 0, 0);

      const header = theme.fg(
        "success",
        `Updated ${details.updatedCells} cell(s)`,
      );

      if (!expanded || !details.operations?.length) {
        return new Text(header, 0, 0);
      }

      // Build markdown table of operations.
      const lines: string[] = [];
      lines.push("| Row | Column | Value |");
      lines.push("|---|---|---|");
      for (const op of details.operations) {
        const val =
          op.value === null || op.value === undefined
            ? ""
            : String(op.value).replace(/\|/g, "\\|");
        lines.push(`| ${op.row} | ${op.column} | ${val} |`);
      }

      const box = new Box(0, 0);
      box.addChild(new Text(header, 0, 0));
      box.addChild(new Markdown(lines.join("\n"), 0, 0, getMarkdownTheme()));
      return box;
    },
  });
}
