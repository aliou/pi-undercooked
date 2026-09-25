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

const parameters = Type.Object({
  mode: Type.Union([Type.Literal("patch"), Type.Literal("replace")], {
    description:
      "Whether to deep-merge into current external state or replace it entirely.",
  }),
  state: Type.Any({
    description:
      "Plain JSON payload for __pi_state_write(payload, mode). Pass a JSON object when possible. Valid values: booleans, numbers, strings, arrays, and nested objects.",
  }),
  readBack: Type.Optional(
    Type.Boolean({
      description:
        "Read back __pi_state() after applying the change. Defaults to true.",
    }),
  ),
});

const READ_CONVENTION = "__pi_state";
const WRITE_CONVENTION = "__pi_state_write";
const PREFIX_OK = "__pi_state_write_ok__:";
const PREFIX_MISSING = "__pi_state_write_missing__:";
const PREFIX_INVALID = "__pi_state_write_invalid__:";
const PREFIX_REJECTED = "__pi_state_write_rejected__:";
const PREFIX_ERROR = "__pi_state_write_error__:";
const READ_OK = "__pi_state_ok__:";
const READ_MISSING = "__pi_state_missing__:";
const READ_INVALID = "__pi_state_invalid__:";
const READ_ERROR = "__pi_state_error__:";

type JsonLike =
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

interface SimGameStateWriteParams {
  mode: "patch" | "replace";
  state: unknown;
  readBack?: boolean;
}

interface SimGameStateWriteDetails {
  mode: "patch" | "replace";
  status: "ok" | "missing_write" | "invalid_return" | "rejected" | "error";
  foundRead: boolean;
  foundWrite: boolean;
  writeResult: string | null;
  readBack: string | null;
  error: string | null;
}

function normalizeStateInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(
      "State payload string must be valid JSON or a structured object",
    );
  }
}

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertJsonLike(
  value: unknown,
  seen = new Set<unknown>(),
): asserts value is JsonLike {
  if (typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("State payload cannot contain non-finite numbers");
    }
    return;
  }

  if (value === null || value === undefined) {
    throw new Error("State payload cannot contain null or undefined");
  }

  if (typeof value !== "object") {
    throw new Error(`Unsupported state payload value: ${typeof value}`);
  }

  if (seen.has(value)) {
    throw new Error("State payload cannot contain cycles");
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) assertJsonLike(item, seen);
    seen.delete(value);
    return;
  }

  if (!isPlainObject(value)) {
    throw new Error("State payload must contain only plain objects and arrays");
  }

  for (const [key, nested] of Object.entries(value)) {
    if (!key) {
      throw new Error("State payload object keys must be non-empty strings");
    }
    assertJsonLike(nested, seen);
  }

  seen.delete(value);
}

function serializeLuaString(value: string): string {
  return JSON.stringify(value);
}

function serializeLuaKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? key
    : `[${serializeLuaString(key)}]`;
}

function serializeLua(value: JsonLike): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return serializeLuaString(value);
  }

  if (Array.isArray(value)) {
    return `{ ${value.map((item) => serializeLua(item)).join(", ")} }`;
  }

  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, nested]) => `${serializeLuaKey(key)} = ${serializeLua(nested)}`,
    );
  return `{ ${entries.join(", ")} }`;
}

function buildWriteExpression(
  payload: string,
  mode: "patch" | "replace",
): string {
  return `p (function()
  local f = rawget(_G, "${WRITE_CONVENTION}")
  local t = type(f)
  if t ~= "function" then
    return "${PREFIX_MISSING}" .. t
  end
  local ok, value = pcall(f, ${payload}, ${serializeLuaString(mode)})
  if not ok then
    return "${PREFIX_ERROR}" .. tostring(value)
  end
  local outType = type(value)
  if outType ~= "table" then
    return "${PREFIX_INVALID}" .. outType
  end
  if value.ok == false then
    return "${PREFIX_REJECTED}" .. ad.dump(value)
  end
  return "${PREFIX_OK}" .. ad.dump(value)
end)()`;
}

function buildReadExpression(): string {
  return `p (function()
  local f = rawget(_G, "${READ_CONVENTION}")
  local t = type(f)
  if t ~= "function" then
    return "${READ_MISSING}" .. t
  end
  local ok, value = pcall(f)
  if not ok then
    return "${READ_ERROR}" .. tostring(value)
  end
  local outType = type(value)
  if outType ~= "table" then
    return "${READ_INVALID}" .. outType
  end
  return "${READ_OK}" .. ad.dump(value)
end)()`;
}

function parseWriteResult(
  raw: string,
  mode: "patch" | "replace",
): SimGameStateWriteDetails {
  const value = stripQuotes(raw);

  if (value.startsWith(PREFIX_OK)) {
    return {
      mode,
      status: "ok",
      foundRead: false,
      foundWrite: true,
      writeResult: value.slice(PREFIX_OK.length),
      readBack: null,
      error: null,
    };
  }

  if (value.startsWith(PREFIX_MISSING)) {
    return {
      mode,
      status: "missing_write",
      foundRead: false,
      foundWrite: false,
      writeResult: null,
      readBack: null,
      error: null,
    };
  }

  if (value.startsWith(PREFIX_INVALID)) {
    return {
      mode,
      status: "invalid_return",
      foundRead: false,
      foundWrite: true,
      writeResult: null,
      readBack: null,
      error: `${WRITE_CONVENTION}() must return a table, got ${value.slice(PREFIX_INVALID.length) || "unknown"}`,
    };
  }

  if (value.startsWith(PREFIX_REJECTED)) {
    return {
      mode,
      status: "rejected",
      foundRead: false,
      foundWrite: true,
      writeResult: value.slice(PREFIX_REJECTED.length),
      readBack: null,
      error: null,
    };
  }

  if (value.startsWith(PREFIX_ERROR)) {
    return {
      mode,
      status: "error",
      foundRead: false,
      foundWrite: true,
      writeResult: null,
      readBack: null,
      error: value.slice(PREFIX_ERROR.length) || "Unknown error",
    };
  }

  return {
    mode,
    status: "error",
    foundRead: false,
    foundWrite: false,
    writeResult: null,
    readBack: null,
    error: value || "Unexpected response",
  };
}

function applyReadBack(details: SimGameStateWriteDetails, raw: string): void {
  const value = stripQuotes(raw);
  if (value.startsWith(READ_OK)) {
    details.foundRead = true;
    details.readBack = value.slice(READ_OK.length);
    return;
  }

  if (value.startsWith(READ_MISSING)) {
    details.foundRead = false;
    details.readBack = null;
    return;
  }

  details.foundRead = true;
  details.readBack = null;
  if (value.startsWith(READ_INVALID)) {
    details.error = `${READ_CONVENTION}() must return a table, got ${value.slice(READ_INVALID.length) || "unknown"}`;
    return;
  }
  if (value.startsWith(READ_ERROR)) {
    details.error = value.slice(READ_ERROR.length) || "Read-back failed";
    return;
  }
  details.error = value || "Read-back failed";
}

function summarize(details: SimGameStateWriteDetails): string {
  switch (details.status) {
    case "ok":
      return `${WRITE_CONVENTION}() applied ${details.mode}`;
    case "missing_write":
      return `${WRITE_CONVENTION}() not found`;
    case "invalid_return":
      return details.error ?? `${WRITE_CONVENTION}() returned an invalid value`;
    case "rejected":
      return `${WRITE_CONVENTION}() rejected the payload`;
    case "error":
      return `${WRITE_CONVENTION}() threw: ${details.error ?? "unknown error"}`;
  }
}

export function createSimGameStateWriteTool(state: RuntimeState) {
  return {
    name: "playdate_sim_game_state_write",
    label: "Playdate Game State Write",
    description:
      "Apply structured game state via __pi_state_write(payload, mode) using patch or replace semantics. Provide JSON state.",
    promptSnippet: "Write structured Playdate game state with JSON",
    promptGuidelines: [
      "Use playdate_sim_game_state_write when a game exposes a global __pi_state_write(payload, mode) hook.",
      "Always pass state as JSON. Prefer a structured JSON object. A JSON string is also accepted.",
      "Use mode patch to deep-merge into the current external game state. Use replace only when you are providing the full external state shape.",
      "Payloads must be plain JSON data: booleans, numbers, strings, arrays, and nested objects. Do not send functions, null, undefined, or other non-JSON values.",
      "Keep arrays replace-only. Do not assume patch merges arrays by index.",
      "The simulator must be running with a game loaded.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: SimGameStateWriteParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimGameStateWriteDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        const normalizedState = normalizeStateInput(params.state);
        if (
          !Array.isArray(normalizedState) &&
          !isPlainObject(normalizedState)
        ) {
          throw new Error(
            "State payload must be a structured object/array or a JSON string that decodes to one",
          );
        }
        assertJsonLike(normalizedState);
        const payload = serializeLua(normalizedState);
        if (payload.length > 64 * 1024) {
          throw new Error("State payload is too large for DAP eval");
        }

        const dap = await ensureSimulatorDap(state, signal);
        const writeResult = await dap.evaluate(
          buildWriteExpression(payload, params.mode),
          signal,
        );

        if (!writeResult.success) {
          throw new Error(writeResult.result ?? "Failed to write game state");
        }

        const details = parseWriteResult(writeResult.result ?? "", params.mode);

        if (details.status === "ok" && (params.readBack ?? true)) {
          const readResult = await dap.evaluate(buildReadExpression(), signal);
          if (!readResult.success) {
            details.error = readResult.result ?? "Read-back failed";
          } else {
            applyReadBack(details, readResult.result ?? "");
          }
        }

        return {
          content: [
            {
              type: "text",
              text:
                details.readBack ?? details.writeResult ?? summarize(details),
            },
          ],
          details,
        };
      });
    },

    renderCall(args: SimGameStateWriteParams, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Game State Write",
          mainArg: args.mode,
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimGameStateWriteDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Game State Write: applying..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) ||
          "Game-state write failed";
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
          label: "Mode",
          value: details.mode,
          showCollapsed: true,
        },
        {
          label: "Status",
          value: summarize(details),
          showCollapsed: true,
        },
      ];

      if (details.writeResult) {
        fields.push({
          label: "Write Result",
          value: details.writeResult,
          showCollapsed: true,
        });
      }

      if (details.readBack) {
        fields.push({
          label: "Read Back",
          value: details.readBack,
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

export function registerSimGameStateWriteTool(
  pi: ExtensionAPI,
  state: RuntimeState,
) {
  pi.registerTool(createSimGameStateWriteTool(state));
}
