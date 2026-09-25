import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { killSimulator } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({});

interface StopSimDetails {
  stopped: boolean;
}

export function createStopSimTool(state: RuntimeState) {
  return {
    name: "playdate_stop_sim",
    label: "Playdate Stop Sim",
    description: "Stop the running Playdate Simulator.",
    promptSnippet: "Stop the Playdate Simulator",
    parameters,

    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<StopSimDetails>> {
      const wasRunning = killSimulator(state);
      ctx.ui.setStatus("playdate", "");

      return {
        content: [
          {
            type: "text",
            text: wasRunning ? "Simulator stopped" : "No simulator was running",
          },
        ],
        details: { stopped: wasRunning },
      };
    },

    renderCall(_args: Record<string, never>, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Stop Sim",
          mainArg: "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<StopSimDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Stop Sim: stopping..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (details?.stopped === undefined) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const msg = details.stopped
        ? "Simulator stopped"
        : "No simulator was running";
      return new Text(theme.fg("muted", msg), 0, 0);
    },
  };
}

export function registerStopSimTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createStopSimTool(state));
}
