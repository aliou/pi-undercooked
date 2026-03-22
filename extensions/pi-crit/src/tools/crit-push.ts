import {
  ToolCallHeader,
  type ToolCallHeaderOptionArg,
} from "@aliou/pi-utils-ui";
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
  message: Type.Optional(
    Type.String({
      description: "Top-level review comment message.",
    }),
  ),
  event: Type.Optional(
    Type.Union(
      [
        Type.Literal("comment"),
        Type.Literal("approve"),
        Type.Literal("request-changes"),
      ],
      { description: "PR review event type. Defaults to comment." },
    ),
  ),
  dryRun: Type.Optional(
    Type.Boolean({
      description: "Preview what would be posted without actually posting.",
      default: false,
    }),
  ),
});

type PushParams = Static<typeof parameters>;

interface PushDetails {
  message?: string;
  dryRun?: boolean;
}

export function registerPushTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_push",
    label: "Crit Push",
    description:
      "Push .crit.json review comments to a GitHub PR. " +
      "Auto-detects the PR from the current branch. Supports approve, comment, and request-changes events.",
    parameters,

    async execute(
      _toolCallId: string,
      params: PushParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<PushDetails>> {
      const args = ["push"];

      if (params.dryRun) {
        args.push("--dry-run");
      }

      if (params.message) {
        args.push("--message", params.message);
      }

      if (params.event) {
        args.push("--event", params.event);
      }

      const result = await critExec(pi, { args, cwd: ctx.cwd, signal });

      if (result.code !== 0) {
        throw new Error(
          `crit push failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      const output =
        (result.stdout + result.stderr).trim() || "Comments pushed to PR";

      return {
        content: [{ type: "text", text: output }],
        details: { message: output, dryRun: params.dryRun ?? false },
      };
    },

    renderCall(params: PushParams, theme: Theme) {
      const optionArgs: ToolCallHeaderOptionArg[] = [];
      if (params.event)
        optionArgs.push({ label: "event", value: params.event });
      if (params.dryRun) optionArgs.push({ label: "dry-run", value: "true" });

      return new ToolCallHeader(
        {
          toolName: "Crit",
          action: "push",
          optionArgs,
          longArgs: params.message
            ? [{ label: "message", value: params.message }]
            : undefined,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Pushing comments to PR..."), 0, 0);
      }

      const details = result.details as PushDetails | undefined;
      const container = new Container();

      if (!details?.message) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Push failed";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      const prefix = details.dryRun ? "[dry-run] " : "";
      container.addChild(
        new Text(theme.fg("success", `${prefix}${details.message}`), 0, 0),
      );

      return container;
    },
  });
}
