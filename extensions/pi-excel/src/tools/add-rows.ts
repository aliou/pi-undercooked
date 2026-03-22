import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { addRows } from "../utils/excel";

const parameters = Type.Object({
  path: Type.String({ description: "Absolute path to the Excel (.xlsx) file" }),
  sheet: Type.Optional(
    Type.String({ description: "Sheet name. Defaults to the first sheet." }),
  ),
  rows: Type.Array(Type.Record(Type.String(), Type.Any()), {
    description:
      "Array of row objects. Keys are column names, values are cell values. Column names must match existing headers.",
  }),
});

export async function executeAddRows(params: {
  path: string;
  sheet?: string;
  rows: Record<string, unknown>[];
}) {
  const result = await addRows(params.path, {
    sheet: params.sheet,
    rows: params.rows,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `Added ${result.addedRows} row(s). Sheet now has ${result.newRowCount} data rows.`,
      },
    ],
    details: { addedRows: result.addedRows, newRowCount: result.newRowCount },
  };
}

export function registerAddRowsTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "excel_add_rows",
    label: "Excel: Add Rows",
    description:
      "Append rows to the end of an Excel sheet. Each row is an object mapping column names to values. Use excel_describe first to learn the column names.",
    parameters,

    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: unknown,
    ) {
      return executeAddRows(params);
    },

    renderCall(args: Static<typeof parameters>, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("Excel: AddRows "));
      text += theme.fg("accent", args.path);
      if (args.sheet) text += theme.fg("dim", ` [${args.sheet}]`);
      text += theme.fg("dim", ` (${args.rows.length} row(s))`);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<unknown>,
      { isPartial }: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (isPartial) return new Text(theme.fg("dim", "Adding rows..."), 0, 0);

      const details = result.details as {
        addedRows?: number;
        newRowCount?: number;
      };
      if (!details) return new Text("", 0, 0);

      let text = theme.fg("success", `Added ${details.addedRows} row(s)`);
      text += theme.fg("dim", `, total: ${details.newRowCount}`);

      return new Text(text, 0, 0);
    },
  });
}
