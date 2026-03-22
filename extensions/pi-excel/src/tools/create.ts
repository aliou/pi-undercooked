import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { createWorkbook } from "../utils/excel";

const SheetDefinition = Type.Object({
  name: Type.String({ description: "Sheet name" }),
  columns: Type.Array(Type.String(), { description: "Column header names" }),
});

const parameters = Type.Object({
  path: Type.String({
    description: "Absolute path for the new Excel (.xlsx) file",
  }),
  sheets: Type.Array(SheetDefinition, {
    description:
      "List of sheets to create, each with a name and column headers.",
  }),
});

export async function executeCreate(params: {
  path: string;
  sheets: { name: string; columns: string[] }[];
}) {
  const result = await createWorkbook(params.path, { sheets: params.sheets });

  return {
    content: [
      {
        type: "text" as const,
        text: `Created workbook at ${result.path} with sheets: ${result.sheets.join(", ")}`,
      },
    ],
    details: { path: result.path, sheets: result.sheets },
  };
}

export function registerCreateTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "excel_create",
    label: "Excel: Create",
    description:
      "Create a new Excel workbook with the specified sheets and column headers. The file must not already exist.",
    parameters,

    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: unknown,
    ) {
      return executeCreate(params);
    },

    renderCall(args: Static<typeof parameters>, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("Excel: Create "));
      text += theme.fg("accent", args.path);
      const sheetNames = args.sheets.map((s) => s.name).join(", ");
      text += theme.fg("dim", ` [${sheetNames}]`);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<unknown>,
      { isPartial }: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (isPartial) return new Text(theme.fg("dim", "Creating..."), 0, 0);

      const details = result.details as
        | { path?: string; sheets: string[] }
        | undefined;
      if (!details) return new Text("", 0, 0);

      let text = theme.fg("success", `Created ${details.path}`);
      text += theme.fg(
        "dim",
        ` (${details.sheets.length} sheet(s): ${details.sheets.join(", ")})`,
      );

      return new Text(text, 0, 0);
    },
  });
}
