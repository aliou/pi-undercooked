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
import { type Static, Type } from "typebox";
import { resolveAuthor } from "../utils/author";
import { critExec } from "../utils/exec";

const parameters = Type.Object({
  commentId: Type.String({
    description: "ID of the comment to reply to (e.g. c1, c2).",
  }),
  body: Type.String({ description: "Reply body text." }),
  resolve: Type.Optional(
    Type.Boolean({
      description: "Mark the parent comment as resolved.",
      default: false,
    }),
  ),
});

type ReplyParams = Static<typeof parameters>;

interface ReplyDetails {
  commentId?: string;
  resolved?: boolean;
}

export function registerCommentReplyTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_comment_reply",
    label: "Crit Reply",
    description:
      "Reply to an existing crit review comment. Optionally marks the comment as resolved.",
    parameters,

    async execute(
      _toolCallId: string,
      params: ReplyParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<ReplyDetails>> {
      const author = resolveAuthor(ctx);

      const args = [
        "comment",
        "--reply-to",
        params.commentId,
        "--author",
        author,
      ];

      if (params.resolve) {
        args.push("--resolve");
      }

      args.push(params.body);

      const result = await critExec(pi, {
        args,
        cwd: ctx.cwd,
        signal,
        lockCritJson: true,
      });

      if (result.code !== 0) {
        throw new Error(
          `crit reply failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      const output = (result.stdout + result.stderr).trim() || "Reply added";

      return {
        content: [{ type: "text", text: output }],
        details: {
          commentId: params.commentId,
          resolved: params.resolve ?? false,
        },
      };
    },

    renderCall(params: ReplyParams, theme: Theme) {
      const optionArgs: ToolCallHeaderOptionArg[] = [];
      if (params.resolve) optionArgs.push({ label: "resolve", value: "true" });

      return new ToolCallHeader(
        {
          toolName: "Crit",
          action: "reply",
          mainArg: params.commentId,
          optionArgs,
          longArgs: [{ label: "body", value: params.body }],
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
        return new Text(theme.fg("muted", "Adding reply..."), 0, 0);
      }

      const details = result.details as ReplyDetails | undefined;
      const container = new Container();

      if (!details?.commentId) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Reply failed";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      const suffix = details.resolved ? " (resolved)" : "";
      container.addChild(
        new Text(
          theme.fg("success", `Reply added to ${details.commentId}${suffix}`),
          0,
          0,
        ),
      );

      return container;
    },
  });
}
