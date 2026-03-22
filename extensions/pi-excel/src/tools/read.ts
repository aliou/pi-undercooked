import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, truncateHead } from "@mariozechner/pi-coding-agent";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { readSheet } from "../utils/excel";

const parameters = Type.Object({
  path: Type.String({ description: "Absolute path to the Excel (.xlsx) file" }),
  sheet: Type.Optional(
    Type.String({ description: "Sheet name. Defaults to the first sheet." }),
  ),
  start_row: Type.Optional(
    Type.Number({
      description: "First data row to read (1-indexed). Defaults to 1.",
    }),
  ),
  end_row: Type.Optional(
    Type.Number({
      description: "Last data row to read (1-indexed). Defaults to last row.",
    }),
  ),
  columns: Type.Optional(
    Type.Array(Type.String(), {
      description: "Column names to include. Defaults to all columns.",
    }),
  ),
});

interface ReadDetails {
  rowCount?: number;
  totalRows?: number;
  headers?: string[];
}

export async function executeRead(params: {
  path: string;
  sheet?: string;
  start_row?: number;
  end_row?: number;
  columns?: string[];
}) {
  const result = await readSheet(params.path, {
    sheet: params.sheet,
    startRow: params.start_row,
    endRow: params.end_row,
    columns: params.columns,
  });

  const truncated = truncateHead(JSON.stringify(result.rows, null, 2), {
    maxBytes: 50000,
  });

  return {
    content: [{ type: "text" as const, text: truncated.content }],
    details: {
      rowCount: result.rows.length,
      totalRows: result.totalRows,
      headers: result.headers,
    },
  };
}

export function registerReadTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "excel_read",
    label: "Excel: Read",
    description:
      "Read data from an Excel sheet. Returns rows as JSON. Supports filtering by row range and columns. Use excel_describe first to learn the sheet structure.",
    parameters,

    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: unknown,
    ) {
      return executeRead(params);
    },

    renderCall(args: Static<typeof parameters>, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("Excel: Read "));
      text += theme.fg("accent", args.path);
      if (args.sheet) text += theme.fg("dim", ` [${args.sheet}]`);
      if (args.start_row || args.end_row) {
        text += theme.fg(
          "dim",
          ` rows ${args.start_row ?? 1}-${args.end_row ?? "end"}`,
        );
      }
      if (args.columns)
        text += theme.fg("dim", ` cols=${args.columns.join(",")}`);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<unknown>,
      { expanded, isPartial }: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (isPartial) return new Text(theme.fg("dim", "Reading..."), 0, 0);

      const details = result.details as ReadDetails;
      if (!details) return new Text("", 0, 0);

      let header = theme.fg("success", `${details.rowCount} row(s) read`);
      if (details.totalRows && details.totalRows !== details.rowCount) {
        header += theme.fg("dim", ` of ${details.totalRows} total`);
      }

      if (!expanded) {
        if (details.headers && details.headers.length > 0) {
          const cols = details.headers.slice(0, 5).join(", ");
          const more =
            details.headers.length > 5
              ? `, +${details.headers.length - 5} more`
              : "";
          header += theme.fg("dim", ` [${cols}${more}]`);
        }
        return new Text(header, 0, 0);
      }

      // Build markdown table from result rows.
      try {
        const first = result.content[0];
        const rows = JSON.parse(first?.type === "text" ? first.text : "[]");
        const headers =
          details.headers || (rows.length > 0 ? Object.keys(rows[0]) : []);

        if (rows.length === 0 || headers.length === 0) {
          return new Text(header + theme.fg("dim", " (no data)"), 0, 0);
        }

        const displayRows = rows.slice(0, 50);
        const lines: string[] = [];

        // Markdown table header.
        lines.push(`| ${headers.join(" | ")} |`);
        lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

        for (const row of displayRows) {
          const cells = headers.map((h: string) => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            return String(val).replace(/\|/g, "\\|");
          });
          lines.push(`| ${cells.join(" | ")} |`);
        }

        if (rows.length > 50) {
          lines.push("");
          lines.push(`*... and ${rows.length - 50} more rows*`);
        }

        const box = new Box(0, 0);
        box.addChild(new Text(header, 0, 0));
        box.addChild(new Markdown(lines.join("\n"), 0, 0, getMarkdownTheme()));
        return box;
      } catch {
        return new Text(header, 0, 0);
      }
    },
  });
}
