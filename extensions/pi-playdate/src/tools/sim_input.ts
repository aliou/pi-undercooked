import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  type AgentToolResult,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolRenderResultOptions,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { DAP_QUEUE_KEY } from "../lib/dap-queue";
import { ensureSimulatorDap, isSimulatorRunning } from "../lib/sim";
import { openSimulatorMenu } from "../lib/sim-control";
import type { RuntimeState } from "../lib/state";

const BUTTONS = ["up", "down", "left", "right", "a", "b", "menu"] as const;

const ACTIONS = ["press", "release", "hold"] as const;

const parameters = Type.Object({
  button: StringEnum([...BUTTONS], {
    description: "Button to press: up/down/left/right (D-pad), a, b, or menu.",
  }),
  action: Type.Optional(
    StringEnum([...ACTIONS], {
      description:
        'Action type. "press" sends a tap (default), "hold" holds for duration_ms then releases.',
      default: "press",
    }),
  ),
  duration_ms: Type.Optional(
    Type.Number({
      description: "Hold duration in ms (only for action=hold). Default 200.",
      default: 200,
    }),
  ),
  repeat: Type.Optional(
    Type.Number({
      description: "Number of times to repeat the press. Default 1.",
      default: 1,
    }),
  ),
});

interface SimInputParams {
  button: string;
  action?: string;
  duration_ms?: number;
  repeat?: number;
}

interface SimInputDetails {
  button: string;
  action: string;
  repeat: number;
}

const BUTTON_CALLBACKS: Record<string, { down: string; up: string }> = {
  up: { down: "playdate.upButtonDown", up: "playdate.upButtonUp" },
  down: { down: "playdate.downButtonDown", up: "playdate.downButtonUp" },
  left: { down: "playdate.leftButtonDown", up: "playdate.leftButtonUp" },
  right: { down: "playdate.rightButtonDown", up: "playdate.rightButtonUp" },
  a: { down: "playdate.AButtonDown", up: "playdate.AButtonUp" },
  b: { down: "playdate.BButtonDown", up: "playdate.BButtonUp" },
};

export function createSimInputTool(pi: ExtensionAPI, state: RuntimeState) {
  return {
    name: "playdate_sim_input",
    label: "Playdate Sim Input",
    description:
      "Send button input to the Playdate Simulator (D-pad, A, B, menu).",
    promptSnippet: "Send input to the Playdate Simulator",
    promptGuidelines: [
      "Use playdate_sim_input to interact with the game in the simulator.",
      "playdate_sim_input supports these buttons: up, down, left, right, a, b, menu.",
      'playdate_sim_input uses action "press" for a tap, "hold" for a short held input, and "release" to release a held button.',
      "playdate_sim_input uses repeat for repeated taps, such as moving a cursor multiple cells.",
      "playdate_sim_input requires the simulator to be running with a Lua game. Use playdate_run_sim first.",
      "Use playdate_sim_input in this loop: playdate_screenshot, decide next move, playdate_sim_input, then playdate_screenshot again.",
      "For non-vision play, use playdate_sim_eval to read state before and after playdate_sim_input.",
      "playdate_sim_input sends direct Lua button callbacks for D-pad and A/B, so the agent can play without window focus or UI automation.",
      "playdate_sim_input uses the simulator's native system-menu path for menu, not a Lua callback.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: SimInputParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimInputDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        const button = params.button;
        const action = params.action || "press";
        const repeat = params.repeat ?? 1;

        if (button === "menu") {
          if (!isSimulatorRunning(state) || !state.simPid) {
            throw new Error(
              "Simulator is not running. Start it first with playdate_run_sim.",
            );
          }

          if (action === "release") {
            return {
              content: [
                {
                  type: "text",
                  text: "Menu release is a no-op; the native menu path opens on press.",
                },
              ],
              details: { button: "menu", action, repeat },
            };
          }

          for (let i = 0; i < repeat; i++) {
            await openSimulatorMenu(pi, state.simPid, { signal });
          }

          return {
            content: [{ type: "text", text: "Opened Playdate system menu" }],
            details: { button: "menu", action, repeat },
          };
        }

        const dap = await ensureSimulatorDap(state, signal);
        return sendInputDAP(dap, button, action, repeat, signal);
      });
    },

    renderCall(args: SimInputParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.action && args.action !== "press") {
        optionArgs.push({ label: "action", value: args.action });
      }
      if (args.repeat && args.repeat > 1) {
        optionArgs.push({ label: "repeat", value: `${args.repeat}` });
      }

      return new ToolCallHeader(
        {
          toolName: "Playdate Sim Input",
          mainArg: args.button || "",
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimInputDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Sim Input: sending..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.button) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) || "Input failed";
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

      const label =
        details.repeat > 1
          ? `${details.button} x${details.repeat}`
          : details.button;
      return new Text(`Sent ${label} to simulator`, 0, 0);
    },
  };
}

async function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Operation aborted"),
      );
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function sendInputDAP(
  dap: { evalLua(code: string, signal?: AbortSignal): Promise<string> },
  button: string,
  action: string,
  repeat: number,
  signal?: AbortSignal,
): Promise<AgentToolResult<SimInputDetails>> {
  const callbacks = BUTTON_CALLBACKS[button];
  if (!callbacks) {
    throw new Error(`Unknown button: ${button}`);
  }

  for (let i = 0; i < repeat; i++) {
    if (action === "hold") {
      await dap.evalLua(
        `if ${callbacks.down} then ${callbacks.down}() end`,
        signal,
      );
      // For hold, we call down then up after a brief delay
      await waitMs(50, signal);
      await dap.evalLua(
        `if ${callbacks.up} then ${callbacks.up}() end`,
        signal,
      );
    } else if (action === "release") {
      await dap.evalLua(
        `if ${callbacks.up} then ${callbacks.up}() end`,
        signal,
      );
    } else {
      // press: send a tap by calling down then up
      await dap.evalLua(
        `if ${callbacks.down} then ${callbacks.down}() end`,
        signal,
      );
      await dap.evalLua(
        `if ${callbacks.up} then ${callbacks.up}() end`,
        signal,
      );
      await waitMs(20, signal);
    }

    if (i < repeat - 1) {
      await waitMs(20, signal);
    }
  }

  const label = repeat > 1 ? `${button} x${repeat} (${action})` : `${button}`;

  return {
    content: [{ type: "text", text: `Sent ${label} to simulator` }],
    details: { button, action, repeat },
  };
}

export function registerSimInputTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createSimInputTool(pi, state));
}
