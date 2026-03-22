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
import { critExec } from "../utils/exec";

interface ClearDetails {
  cleared?: boolean;
}

export function registerClearTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_clear",
    label: "Crit Clear",
    description: "Remove .crit.json and clear all review state.",
    parameters: Type.Object({}),

    async execute(
      _toolCallId: string,
      _params: unknown,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<ClearDetails>> {
      const result = await critExec(pi, {
        args: ["comment", "--clear"],
        cwd: ctx.cwd,
        signal,
        lockCritJson: true,
      });

      if (result.code !== 0) {
        throw new Error(
          `crit clear failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      return {
        content: [{ type: "text", text: "Review state cleared" }],
        details: { cleared: true },
      };
    },

    renderCall(_params: unknown, theme: Theme) {
      return new ToolCallHeader({ toolName: "Crit", action: "clear" }, theme);
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Clearing..."), 0, 0);
      }

      if (!(result.details as ClearDetails | undefined)?.cleared) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Clear failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      return new Text(theme.fg("success", "Review state cleared"), 0, 0);
    },
  });
}
