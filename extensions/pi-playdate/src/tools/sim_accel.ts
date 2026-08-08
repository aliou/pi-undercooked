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
import { setSimulatorAccelerometer } from "../lib/sim-control";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  x: Type.Number({
    description:
      "Accelerometer X in g (roll). Positive = right edge down. Typical range -1..1.",
  }),
  y: Type.Number({
    description:
      "Accelerometer Y in g (pitch). Positive = top edge down. Typical range -1..1.",
  }),
  z: Type.Number({
    description:
      "Accelerometer Z in g. 1.0 = device flat, screen up. Typical range -1..1.",
  }),
});

interface SimAccelParams {
  x: number;
  y: number;
  z: number;
}

interface SimAccelDetails {
  x: number;
  y: number;
  z: number;
}

export function createSimAccelTool(pi: ExtensionAPI, state: RuntimeState) {
  return {
    name: "playdate_sim_accel",
    label: "Playdate Sim Accel",
    description:
      "Set Playdate Simulator accelerometer values (roll, pitch, and Z in g).",
    promptSnippet: "Set accelerometer values in the Playdate Simulator",
    promptGuidelines: [
      "Use playdate_sim_accel to drive tilt-based games in the simulator.",
      "playdate_sim_accel sets raw accelerometer values in g on the X, Y, and Z axes.",
      "playdate_sim_accel requires the simulator to be running. Use playdate_run_sim first.",
      "playdate_sim_accel is macOS-only. Other platforms will error.",
      "The game must call playdate.startAccelerometer() to receive values. Otherwise playdate.readAccelerometer() returns nil.",
      "Use playdate_sim_state after playdate_sim_accel to confirm the hardware values. Use playdate_sim_eval only for game-specific state or debugging.",
      "Typical resting values: x=0, y=0, z=1 (device flat, screen up). x=-1 rolls left, x=1 rolls right, y=-1 pitches forward.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: SimAccelParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimAccelDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        if (!isSimulatorRunning(state) || !state.simPid) {
          throw new Error(
            "Simulator is not running. Start it first with playdate_run_sim.",
          );
        }

        await setSimulatorAccelerometer(
          pi,
          state.simPid,
          params.x,
          params.y,
          params.z,
          { signal },
        );

        return {
          content: [
            {
              type: "text",
              text: `Accelerometer set: x=${params.x}, y=${params.y}, z=${params.z}`,
            },
          ],
          details: { x: params.x, y: params.y, z: params.z },
        };
      });
    },

    renderCall(args: SimAccelParams, theme: Theme) {
      const mainArg =
        args.x !== undefined && args.y !== undefined && args.z !== undefined
          ? `${args.x},${args.y},${args.z}`
          : "";
      return new ToolCallHeader(
        {
          toolName: "Playdate Sim Accel",
          mainArg,
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimAccelDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Sim Accel: applying..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details || details.x === undefined) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) ||
          "Accelerometer control failed";
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

      return new Text(
        `Accel: x=${details.x}, y=${details.y}, z=${details.z}`,
        0,
        0,
      );
    },
  };
}

export function registerSimAccelTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createSimAccelTool(pi, state));
}
