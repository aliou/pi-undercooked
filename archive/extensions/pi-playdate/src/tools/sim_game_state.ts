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
const CONVENTION_NAME = "__pi_state";
const PREFIX_OK = "__pi_state_ok__:";
const PREFIX_MISSING = "__pi_state_missing__:";
const PREFIX_INVALID = "__pi_state_invalid__:";
const PREFIX_ERROR = "__pi_state_error__:";

interface SimGameStateDetails {
  convention: typeof CONVENTION_NAME;
  status: "ok" | "missing" | "invalid_return" | "error";
  found: boolean;
  returnType: string | null;
  dump: string | null;
  error: string | null;
}

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, "");
}

function parseResult(raw: string): SimGameStateDetails {
  const value = stripQuotes(raw);

  if (value.startsWith(PREFIX_OK)) {
    return {
      convention: CONVENTION_NAME,
      status: "ok",
      found: true,
      returnType: "table",
      dump: value.slice(PREFIX_OK.length),
      error: null,
    };
  }

  if (value.startsWith(PREFIX_MISSING)) {
    return {
      convention: CONVENTION_NAME,
      status: "missing",
      found: false,
      returnType: value.slice(PREFIX_MISSING.length) || null,
      dump: null,
      error: null,
    };
  }

  if (value.startsWith(PREFIX_INVALID)) {
    return {
      convention: CONVENTION_NAME,
      status: "invalid_return",
      found: true,
      returnType: value.slice(PREFIX_INVALID.length) || null,
      dump: null,
      error: null,
    };
  }

  if (value.startsWith(PREFIX_ERROR)) {
    return {
      convention: CONVENTION_NAME,
      status: "error",
      found: true,
      returnType: null,
      dump: null,
      error: value.slice(PREFIX_ERROR.length) || "Unknown error",
    };
  }

  return {
    convention: CONVENTION_NAME,
    status: "error",
    found: false,
    returnType: null,
    dump: null,
    error: value || "Unexpected response",
  };
}

function buildCheckExpression(): string {
  return `p (function()
  local f = rawget(_G, "${CONVENTION_NAME}")
  local t = type(f)
  if t ~= "function" then
    return "${PREFIX_MISSING}" .. t
  end
  local ok, value = pcall(f)
  if not ok then
    return "${PREFIX_ERROR}" .. tostring(value)
  end
  local outType = type(value)
  if outType ~= "table" then
    return "${PREFIX_INVALID}" .. outType
  end
  return "${PREFIX_OK}" .. ad.dump(value)
end)()`;
}

function summarize(details: SimGameStateDetails): string {
  switch (details.status) {
    case "ok":
      return `${CONVENTION_NAME}() returned game state`;
    case "missing":
      return `${CONVENTION_NAME}() not found`;
    case "invalid_return":
      return `${CONVENTION_NAME}() must return a table, got ${details.returnType ?? "unknown"}`;
    case "error":
      return `${CONVENTION_NAME}() threw: ${details.error ?? "unknown error"}`;
  }
}

export function createSimGameStateTool(state: RuntimeState) {
  return {
    name: "playdate_sim_game_state",
    label: "Playdate Game State",
    description:
      "Check the __pi_state() game-state convention and dump structured game state from the running simulator.",
    promptSnippet: "Check Playdate game-state convention and dump state",
    promptGuidelines: [
      "Use playdate_sim_game_state when a Lua game exposes a global __pi_state() function for structured game-state access.",
      "Convention: __pi_state() takes no arguments and returns a plain Lua table containing agent-visible game state.",
      "If playdate_sim_game_state reports the convention is missing, patch the game to add __pi_state() rather than guessing hidden locals.",
      "Keep __pi_state() return values simple: numbers, strings, booleans, nil, and nested tables. Avoid userdata, functions, images, sprites, and other opaque objects.",
      "Use playdate_sim_eval for ad-hoc debugging. Use playdate_sim_game_state for stable structured state reads.",
      "The simulator must be running with a Lua game loaded.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimGameStateDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        const dap = await ensureSimulatorDap(state, signal);
        const result = await dap.evaluate(buildCheckExpression(), signal);

        if (!result.success) {
          throw new Error(result.result ?? "Failed to read game state");
        }

        const details = parseResult(result.result ?? "");
        return {
          content: [
            {
              type: "text",
              text:
                details.status === "ok"
                  ? (details.dump ?? summarize(details))
                  : summarize(details),
            },
          ],
          details,
        };
      });
    },

    renderCall(_args: Record<string, never>, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Game State",
          mainArg: "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimGameStateDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Game State: reading..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) ||
          "Game-state read failed";
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

      const fields = [
        {
          label: "Convention",
          value: `${details.convention}()`,
          showCollapsed: true,
        },
        {
          label: "Status",
          value: summarize(details),
          showCollapsed: true,
        },
      ];

      if (details.dump) {
        fields.push({
          label: "State",
          value: details.dump,
          showCollapsed: true,
        });
      }

      if (details.error) {
        fields.push({
          label: "Error",
          value: details.error,
          showCollapsed: true,
        });
      }

      return new ToolBody(
        {
          fields,
        },
        options,
        theme,
      );
    },
  };
}

export function registerSimGameStateTool(
  pi: ExtensionAPI,
  state: RuntimeState,
) {
  pi.registerTool(createSimGameStateTool(state));
}
