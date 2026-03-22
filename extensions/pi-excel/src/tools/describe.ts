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
import { describeWorkbook, type WorkbookInfo } from "../utils/excel";

const parameters = Type.Object({
  path: Type.String({ description: "Absolute path to the Excel (.xlsx) file" }),
});

interface DescribeDetails {
  workbook?: WorkbookInfo;
}

export async function executeDescribe(params: { path: string }) {
  const workbook = await describeWorkbook(params.path);

  const summary = workbook.sheets
    .map((s) => {
      const cols = s.columns.map((c) => `  ${c.name} (${c.type})`).join("\n");
      return `Sheet: ${s.name}\nRows: ${s.rowCount}, Columns: ${s.columnCount}\n${cols}`;
    })
    .join("\n\n");

  return {
    content: [{ type: "text" as const, text: summary }],
    details: { workbook },
  };
}

export function registerDescribeTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "excel_describe",
    label: "Excel: Describe",
    description:
      "Describe an Excel workbook's structure: sheet names, row counts, column names and inferred types. Use this first to understand a workbook before reading or writing.",
    parameters,

    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: unknown,
    ) {
      return executeDescribe(params);
    },

    renderCall(args: Static<typeof parameters>, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("Excel: Describe "));
      text += theme.fg("accent", args.path);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<unknown>,
      { expanded, isPartial }: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (isPartial)
        return new Text(theme.fg("dim", "Reading workbook..."), 0, 0);

      const details = result.details as DescribeDetails;
      const wb = details?.workbook;
      if (!wb) return new Text("", 0, 0);

      const sheetCount = wb.sheets.length;
      const totalRows = wb.sheets.reduce((sum, s) => sum + s.rowCount, 0);
      let header = theme.fg(
        "success",
        `${sheetCount} sheet(s), ${totalRows} total row(s)`,
      );

      if (!expanded) {
        const names = wb.sheets.map((s) => s.name).join(", ");
        header += theme.fg("dim", ` [${names}]`);
        return new Text(header, 0, 0);
      }

      // Build markdown table for each sheet.
      const lines: string[] = [];
      for (const sheet of wb.sheets) {
        lines.push(
          `### ${sheet.name} (${sheet.rowCount} rows, ${sheet.columnCount} cols)`,
        );
        lines.push("");
        lines.push("| Column | Type |");
        lines.push("|---|---|");
        for (const col of sheet.columns) {
          lines.push(`| ${col.name} | ${col.type} |`);
        }
        lines.push("");
      }

      const box = new Box(0, 0);
      box.addChild(new Text(header, 0, 0));
      box.addChild(new Markdown(lines.join("\n"), 0, 0, getMarkdownTheme()));
      return box;
    },
  });
}
