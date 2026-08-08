import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { truncateTail } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { isSimulatorRunning } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  lines: Type.Optional(
    Type.Number({ description: "Number of log lines to return", default: 50 }),
  ),
  grep: Type.Optional(
    Type.String({ description: "Filter log lines by pattern" }),
  ),
});

type SimLogParams = Static<typeof parameters>;

interface SimLogDetails {
  lines: string[];
  totalSeen: number;
  simRunning: boolean;
}

export function createSimLogTool(state: RuntimeState) {
  return {
    name: "playdate_sim_log",
    label: "Playdate Sim Log",
    description:
      "Get recent simulator log output from the simulator process and DAP console/output events.",
    promptSnippet: "Read Playdate Simulator log output",
    promptGuidelines: [
      "Use playdate_sim_log to read recent simulator output when debugging crashes, print() output, or runtime errors.",
      "playdate_sim_log reads the shared in-memory ring buffer fed by simulator stdout/stderr and DAP output events when available.",
      "After playdate_run_sim, playdate_sim_input, or a suspected runtime failure, check playdate_sim_log before assuming the game state explains the issue.",
      "If playdate_sim_log is empty, the game may not have printed anything and the simulator may not have emitted console output for that path.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: SimLogParams,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimLogDetails>> {
      const maxLines = params.lines ?? 50;
      let lines = [...state.simLogBuffer];

      if (params.grep) {
        const pattern = new RegExp(params.grep, "i");
        lines = lines.filter((l) => pattern.test(l));
      }

      lines = lines.slice(-maxLines);
      const simRunning = isSimulatorRunning(state);

      const truncated = truncateTail(lines.join("\n"));

      return {
        content: [
          {
            type: "text",
            text:
              truncated.content ||
              "(no simulator or DAP output captured yet; use print() in your game code to emit logs)",
          },
        ],
        details: {
          lines,
          totalSeen: state.simLogTotalSeen,
          simRunning,
        },
      };
    },

    renderCall(args: SimLogParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.lines)
        optionArgs.push({ label: "lines", value: `${args.lines}` });
      if (args.grep)
        optionArgs.push({ label: "grep", value: `"${args.grep}"` });

      return new ToolCallHeader(
        { toolName: "Playdate Sim Log", mainArg: "", optionArgs, longArgs: [] },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimLogDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Sim Log: reading..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.lines) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const fields = [
        {
          label: "Status",
          value: details.simRunning ? "running" : "stopped",
          showCollapsed: true,
        },
        {
          label: "Lines",
          value: `${details.lines.length} (${details.totalSeen} total)`,
          showCollapsed: true,
        },
      ];

      const footerItems = [
        { label: "total seen", value: `${details.totalSeen}` },
      ];

      return new ToolBody(
        {
          fields,
          footer: new ToolFooter(theme, {
            items: footerItems,
            separator: " | ",
          }),
          includeSpacerBeforeFooter: true,
        },
        options,
        theme,
      );
    },
  };
}

export function registerSimLogTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createSimLogTool(state));
}
