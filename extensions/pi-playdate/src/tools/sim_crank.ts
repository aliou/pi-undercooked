import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { DAP_QUEUE_KEY } from "../lib/dap-queue";
import { isSimulatorRunning } from "../lib/sim";
import { setSimulatorCrank, setSimulatorCrankDocked } from "../lib/sim-control";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  angle: Type.Optional(
    Type.Number({
      description:
        "Crank angle in degrees (0-360+). 0/360 = straight up, 90 = right, 180 = down, 270 = left. Omit to only change dock state.",
    }),
  ),
  docked: Type.Optional(
    Type.Boolean({
      description:
        "Whether the crank is docked. Games only receive crank input when undocked.",
    }),
  ),
});

interface SimCrankParams {
  angle?: number;
  docked?: boolean;
}

interface SimCrankDetails {
  angle?: number;
  docked?: boolean;
}

export function createSimCrankTool(pi: ExtensionAPI, state: RuntimeState) {
  return {
    name: "playdate_sim_crank",
    label: "Playdate Sim Crank",
    description:
      "Control the Playdate Simulator crank: set the angle and/or dock state.",
    promptSnippet: "Set crank angle or dock state in the Playdate Simulator",
    promptGuidelines: [
      "Use playdate_sim_crank to drive crank-based games in the simulator.",
      "playdate_sim_crank sets the crank angle in degrees and/or docks/undocks the crank.",
      "playdate_sim_crank requires the simulator to be running. Use playdate_run_sim first.",
      "playdate_sim_crank is macOS-only. Other platforms will error.",
      "Games only see crank input when docked=false. If the game responds to crank but nothing happens, set docked=false.",
      "Use playdate_sim_state after playdate_sim_crank to confirm crank position and dock state. Use playdate_sim_eval only for game-specific state or debugging.",
      "playdate_sim_crank is ~10ms per call after the first invocation. First call loads an in-process agent into the simulator (~1s).",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: SimCrankParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimCrankDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        if (!isSimulatorRunning(state) || !state.simPid) {
          throw new Error(
            "Simulator is not running. Start it first with playdate_run_sim.",
          );
        }

        if (params.angle === undefined && params.docked === undefined) {
          throw new Error("Provide at least one of angle or docked.");
        }

        const pid = state.simPid;

        if (params.angle !== undefined) {
          await setSimulatorCrank(pi, pid, params.angle, {
            docked: params.docked,
            signal,
          });
        } else if (params.docked !== undefined) {
          await setSimulatorCrankDocked(pi, pid, params.docked, { signal });
        }

        const parts: string[] = [];
        if (params.angle !== undefined)
          parts.push(`angle=${params.angle.toFixed(2)}`);
        if (params.docked !== undefined) parts.push(`docked=${params.docked}`);

        return {
          content: [{ type: "text", text: `Crank set: ${parts.join(", ")}` }],
          details: { angle: params.angle, docked: params.docked },
        };
      });
    },

    renderCall(args: SimCrankParams, theme: Theme) {
      const mainArg = args.angle !== undefined ? `${args.angle}\u00B0` : "";
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.docked !== undefined) {
        optionArgs.push({ label: "docked", value: String(args.docked) });
      }
      return new ToolCallHeader(
        {
          toolName: "Playdate Sim Crank",
          mainArg,
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimCrankDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Sim Crank: applying..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (
        !details ||
        (details.angle === undefined && details.docked === undefined)
      ) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) ||
          "Crank control failed";
        return new ToolBody(
          {
            fields: [
              {
                label: "Error",
                value: theme.fg("error", msg),
                showCollapsed: true,
              },
            ],
          },
          options,
          theme,
        );
      }

      const parts: string[] = [];
      if (details.angle !== undefined)
        parts.push(`angle=${details.angle.toFixed(2)}\u00B0`);
      if (details.docked !== undefined) parts.push(`docked=${details.docked}`);
      return new Text(`Crank: ${parts.join(", ")}`, 0, 0);
    },
  };
}

export function registerSimCrankTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createSimCrankTool(pi, state));
}
