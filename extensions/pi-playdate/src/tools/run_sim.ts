import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { ResolvedPlaydateConfig } from "../config";
import { findPdxBundle } from "../lib/project";
import { getSimulatorLaunchPath, resolveSDKPath } from "../lib/sdk";
import { runSimulator } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  pdxPath: Type.Optional(
    Type.String({
      description:
        "Path to .pdx bundle. Defaults to last build or auto-detect.",
    }),
  ),
});

type RunSimParams = Static<typeof parameters>;

interface RunSimDetails {
  pid: number;
  pdxPath: string;
  startedAt: string;
  reused: boolean;
}

export function createRunSimTool(
  _pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  return {
    name: "playdate_run_sim",
    label: "Playdate Run Sim",
    description: "Launch the Playdate Simulator with a .pdx bundle.",
    promptSnippet: "Start the Playdate Simulator",
    parameters,

    async execute(
      _toolCallId: string,
      params: RunSimParams,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<RunSimDetails>> {
      // runSimulator is async (reuse detection), so this execute is async
      const sdkPath = resolveSDKPath(config);
      const simPath = getSimulatorLaunchPath(sdkPath);
      if (!simPath) {
        throw new Error(
          "Simulator not found. Run playdate_doctor to check your setup.",
        );
      }

      let pdxPath = params.pdxPath;
      if (!pdxPath && state.lastBuildResult) {
        pdxPath = state.lastBuildResult.pdxPath;
      }
      if (!pdxPath) {
        pdxPath = findPdxBundle(ctx.cwd) ?? undefined;
      }
      if (!pdxPath) {
        throw new Error(
          "No .pdx bundle found. Build the project first with playdate_build.",
        );
      }

      const { pid, reused } = await runSimulator(
        simPath,
        pdxPath,
        state,
        config.simulatorLogLines,
      );

      ctx.ui.setStatus("playdate", "sim running");
      const msg = reused
        ? `Simulator reused (PID ${pid}), loaded ${pdxPath}`
        : `Simulator started (PID ${pid})`;
      ctx.ui.notify(
        reused ? "Game loaded in simulator" : "Simulator started",
        "info",
      );

      return {
        content: [{ type: "text", text: msg }],
        details: {
          pid,
          pdxPath,
          startedAt: state.simStartedAt ?? new Date().toISOString(),
          reused,
        },
      };
    },

    renderCall(args: RunSimParams, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Run Sim",
          mainArg: args.pdxPath || "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<RunSimDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Run Sim: starting..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.pid) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Failed to start";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const fields = [
        { label: "PID", value: `${details.pid}`, showCollapsed: true },
        { label: "Bundle", value: details.pdxPath, showCollapsed: true },
      ];

      return new ToolBody({ fields }, options, theme);
    },
  };
}

export function registerRunSimTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerTool(createRunSimTool(pi, config, state));
}
