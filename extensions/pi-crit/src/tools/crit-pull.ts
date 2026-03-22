import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { critExec } from "../utils/exec";

const parameters = Type.Object({
  prNumber: Type.Optional(
    Type.Number({
      description:
        "PR number to pull comments from. Omit to auto-detect from current branch.",
    }),
  ),
});

type PullParams = Static<typeof parameters>;

interface PullDetails {
  message?: string;
}

export function registerPullTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_pull",
    label: "Crit Pull",
    description:
      "Pull GitHub PR review comments into .crit.json. " +
      "Auto-detects the PR from the current branch, or specify a PR number.",
    parameters,

    async execute(
      _toolCallId: string,
      params: PullParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<PullDetails>> {
      const args = ["pull"];
      if (params.prNumber) {
        args.push(`${params.prNumber}`);
      }

      const result = await critExec(pi, {
        args,
        cwd: ctx.cwd,
        signal,
        lockCritJson: true,
      });

      if (result.code !== 0) {
        throw new Error(
          `crit pull failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      const output =
        (result.stdout + result.stderr).trim() || "PR comments pulled";

      return {
        content: [{ type: "text", text: output }],
        details: { message: output },
      };
    },

    renderCall(params: PullParams, theme: Theme) {
      const mainArg = params.prNumber ? `#${params.prNumber}` : "auto-detect";
      return new ToolCallHeader(
        { toolName: "Crit", action: "pull", mainArg },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Pulling PR comments..."), 0, 0);
      }

      const details = result.details as PullDetails | undefined;
      const container = new Container();

      if (!details?.message) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Pull failed";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      container.addChild(new Text(theme.fg("success", details.message), 0, 0));

      return container;
    },
  });
}
