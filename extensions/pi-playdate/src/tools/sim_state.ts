import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
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
import { ensureSimulatorDap } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({});

interface Crank {
  position: number | null;
  change: number | null;
  docked: boolean | null;
}

interface Accel {
  x: number | null;
  y: number | null;
  z: number | null;
}

interface Buttons {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
}

interface SimStateDetails {
  crank: Crank;
  accel: Accel;
  buttons: Buttons;
  fps: number | null;
  elapsedTime: number | null;
  currentTimeMs: number | null;
  batteryPct: number | null;
}

function parseValue(raw: string): string | number | boolean | null {
  if (raw === "nil") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (!Number.isNaN(n)) return n;
  return raw;
}

function parseState(output: string): SimStateDetails {
  const fields: Record<string, string | number | boolean | null> = {};
  for (const pair of output.split("|")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    fields[pair.slice(0, eq)] = parseValue(pair.slice(eq + 1));
  }
  const num = (k: string) =>
    typeof fields[k] === "number" ? (fields[k] as number) : null;
  const bool = (k: string) =>
    typeof fields[k] === "boolean" ? (fields[k] as boolean) : false;
  const boolN = (k: string) =>
    typeof fields[k] === "boolean" ? (fields[k] as boolean) : null;

  return {
    crank: {
      position: num("crank_pos"),
      change: num("crank_change"),
      docked: boolN("crank_docked"),
    },
    accel: {
      x: num("accel_x"),
      y: num("accel_y"),
      z: num("accel_z"),
    },
    buttons: {
      up: bool("btn_up"),
      down: bool("btn_down"),
      left: bool("btn_left"),
      right: bool("btn_right"),
      a: bool("btn_a"),
      b: bool("btn_b"),
    },
    fps: num("fps"),
    elapsedTime: num("elapsed_time"),
    currentTimeMs: num("current_time_ms"),
    batteryPct: num("battery_pct"),
  };
}

function summarize(d: SimStateDetails): string {
  const pressed = Object.entries(d.buttons)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const parts = [
    `crank=${d.crank.position ?? "?"}\u00B0 (${d.crank.docked ? "docked" : "undocked"})`,
    `accel=(${d.accel.x ?? "?"}, ${d.accel.y ?? "?"}, ${d.accel.z ?? "?"})`,
    `buttons=${pressed.length ? pressed.join(",") : "none"}`,
    `fps=${d.fps ?? "?"}`,
  ];
  return parts.join(" | ");
}

export function createSimStateTool(state: RuntimeState) {
  return {
    name: "playdate_sim_state",
    label: "Playdate Sim State",
    description:
      "Read current Playdate Simulator hardware state: crank, accelerometer, buttons, FPS, battery, elapsed time.",
    promptSnippet: "Read Playdate Simulator hardware state",
    promptGuidelines: [
      "Use playdate_sim_state to read hardware input and runtime state in one call: crank position/dock, accelerometer x/y/z, pressed buttons, FPS, battery, elapsed time.",
      "playdate_sim_state replaces per-call playdate_sim_eval for reading common hardware state. It is faster and returns structured data.",
      "Use playdate_sim_state after playdate_sim_crank, playdate_sim_accel, or playdate_sim_input to confirm effects.",
      "playdate_sim_state requires the simulator to be running with a Lua game. Accelerometer values are nil unless the game called playdate.startAccelerometer().",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimStateDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        const dap = await ensureSimulatorDap(state, signal);
        const result = await dap.evaluate("p ad.state()", signal);
        if (!result.success) {
          throw new Error(result.result ?? "Failed to read simulator state");
        }
        // DAP returns the string possibly wrapped in quotes; strip them.
        const raw = (result.result ?? "").replace(/^"|"$/g, "");
        const details = parseState(raw);
        return {
          content: [{ type: "text", text: summarize(details) }],
          details,
        };
      });
    },

    renderCall(_args: Record<string, never>, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Sim State",
          mainArg: "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimStateDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Sim State: reading..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) || "Read failed";
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

      return new Text(summarize(details), 0, 0);
    },
  };
}

export function registerSimStateTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createSimStateTool(state));
}
