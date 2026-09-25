import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { critExec } from "../utils/exec";

interface UnpublishDetails {
  unpublished?: boolean;
}

export function registerUnpublishTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_unpublish",
    label: "Crit Unpublish",
    description:
      "Remove a previously shared review from crit-web. " +
      "Uses the delete token stored in .crit.json.",
    parameters: Type.Object({}),

    async execute(
      _toolCallId: string,
      _params: unknown,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<UnpublishDetails>> {
      const result = await critExec(pi, {
        args: ["unpublish"],
        cwd: ctx.cwd,
        signal,
        includeShareUrl: true,
        lockCritJson: true,
      });

      if (result.code !== 0) {
        throw new Error(
          `crit unpublish failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      const output =
        (result.stdout + result.stderr).trim() || "Review unpublished";

      return {
        content: [{ type: "text", text: output }],
        details: { unpublished: true },
      };
    },

    renderCall(_params: unknown, theme: Theme) {
      return new ToolCallHeader(
        { toolName: "Crit", action: "unpublish" },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Unpublishing..."), 0, 0);
      }

      const details = result.details as UnpublishDetails | undefined;

      if (!details?.unpublished) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Unpublish failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      return new Text(
        theme.fg("success", "Review removed from crit-web"),
        0,
        0,
      );
    },
  });
}
