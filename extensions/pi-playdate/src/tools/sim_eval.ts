import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import {
  type AgentToolResult,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolRenderResultOptions,
  truncateTail,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { DAP_QUEUE_KEY } from "../lib/dap-queue";
import { ensureSimulatorDap } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  expression: Type.String({
    description:
      'Lua expression or code to evaluate. Bare expressions are auto-serialized (e.g. "playdate.readAccelerometer()" returns "(0.5, 0, 0)"). Prefix with "p " to get raw value, or "eval " to run statements (print() output is captured and returned).',
  }),
  depth: Type.Optional(
    Type.Number({
      description: "Maximum nested table depth for bare-expression dumps.",
      minimum: 0,
    }),
  ),
  start: Type.Optional(
    Type.Number({
      description: "1-based start index when inspecting array-like tables.",
      minimum: 1,
    }),
  ),
  keypath: Type.Optional(
    Type.String({
      description:
        'Dot-separated subpath inside the bare-expression result, e.g. "cards.13".',
    }),
  ),
  keysOnly: Type.Optional(
    Type.Boolean({
      description:
        "Return only keys for the selected table instead of full values.",
    }),
  ),
});

interface SimEvalParams {
  expression: string;
  depth?: number;
  start?: number;
  keypath?: string;
  keysOnly?: boolean;
}

// Playdate's REPL binds `print` per-chunk, so a helper function defined in a
// prior `eval` call can't intercept print() in a later chunk. We solve this
// by inlining a single-chunk wrap that defines and uses the override in the
// same evaluation.
function buildCaptureWrap(body: string): string {
  return `p (function()
  local __pd_buf = {}
  local __pd_orig = print
  print = function(...)
    local parts = {}
    for i = 1, select("#", ...) do parts[i] = tostring((select(i, ...))) end
    __pd_buf[#__pd_buf+1] = table.concat(parts, "\\t")
  end
  local __pd_ok, __pd_err = pcall(function() ${body} end)
  print = __pd_orig
  if not __pd_ok then error(__pd_err) end
  return table.concat(__pd_buf, "\\n")
end)()`;
}

function buildInspectWrap(expression: string, params: SimEvalParams): string {
  const opts: string[] = [];
  if (params.depth !== undefined) opts.push(`depth = ${params.depth}`);
  if (params.start !== undefined) opts.push(`start = ${params.start}`);
  if (params.keypath) opts.push(`keypath = ${JSON.stringify(params.keypath)}`);
  if (params.keysOnly !== undefined) {
    opts.push(`keysOnly = ${params.keysOnly ? "true" : "false"}`);
  }
  const options = opts.length > 0 ? `{ ${opts.join(", ")} }` : "nil";
  return `p ad.inspect(${expression}, ${options})`;
}

function normalizeExpression(params: SimEvalParams): string {
  const trimmed = params.expression.trim();
  if (trimmed.startsWith("p ") || trimmed === "p") {
    return trimmed;
  }
  if (trimmed.startsWith("eval ") || trimmed === "eval") {
    const body = trimmed.replace(/^eval\s*/, "");
    if (!body) return trimmed;
    return buildCaptureWrap(body);
  }
  return buildInspectWrap(trimmed, params);
}

interface SimEvalDetails {
  success: boolean;
  result?: string;
  expression: string;
}

export function createSimEvalTool(state: RuntimeState) {
  return {
    name: "playdate_sim_eval",
    label: "Playdate Sim Eval",
    description:
      "Evaluate Lua expressions in the running Playdate Simulator. Bare expressions are auto-serialized. Prefix with 'p ' for raw value, 'eval ' for statements.",
    promptSnippet: "Evaluate Lua in the Playdate Simulator",
    promptGuidelines: [
      "Prefer playdate_sim_state for reading hardware state (crank, accel, buttons). Use playdate_sim_eval only for game-specific state or debugging.",
      'playdate_sim_eval auto-serializes bare expressions: "playdate.readAccelerometer()" returns "(0.5, 0, 0)".',
      'playdate_sim_eval with "p <expr>" returns the raw value (tab-separated for multi-returns).',
      "Bare-expression dumps support optional depth, start, keypath, and keysOnly controls for safer table inspection.",
      'playdate_sim_eval with "eval <code>" runs statements and returns captured print() output.',
      "The simulator must be running with a Lua game loaded.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: SimEvalParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<SimEvalDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        const dap = await ensureSimulatorDap(state, signal);
        const sent = normalizeExpression(params);
        const result = await dap.evaluate(sent, signal);

        if (!result.success) {
          return {
            content: [
              { type: "text", text: result.result || "Evaluation failed" },
            ],
            details: {
              success: false,
              result: result.result,
              expression: params.expression,
            },
          };
        }

        const output = result.result || "(no return value)";
        const truncated = truncateTail(output);

        return {
          content: [{ type: "text", text: truncated.content }],
          details: {
            success: true,
            result: output,
            expression: params.expression,
          },
        };
      });
    },

    renderCall(args: SimEvalParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.depth !== undefined) {
        optionArgs.push({ label: "depth", value: String(args.depth) });
      }
      if (args.start !== undefined) {
        optionArgs.push({ label: "start", value: String(args.start) });
      }
      if (args.keypath) {
        optionArgs.push({ label: "keypath", value: args.keypath });
      }
      if (args.keysOnly) {
        optionArgs.push({ label: "keys", value: "only" });
      }

      return new ToolCallHeader(
        {
          toolName: "Playdate Sim Eval",
          mainArg: args.expression || "",
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<SimEvalDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Sim Eval: evaluating..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details) {
        const textBlock = result.content.find((c) => c.type === "text");
        const msg =
          (textBlock?.type === "text" && textBlock.text) || "Eval failed";
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

      const fields: Array<{
        label: string;
        value: string;
        showCollapsed: boolean;
      }> = [
        {
          label: "Expression",
          value: details.expression,
          showCollapsed: true,
        },
      ];

      if (details.result) {
        fields.push({
          label: "Result",
          value: details.result,
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

export function registerSimEvalTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createSimEvalTool(state));
}
