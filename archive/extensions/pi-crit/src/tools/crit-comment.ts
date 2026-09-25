import { ToolCallHeader } from "@aliou/pi-utils-ui";
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
  path: Type.String({ description: "File path for the comment." }),
  line: Type.Number({ description: "Start line number." }),
  endLine: Type.Optional(
    Type.Number({ description: "End line number for range comments." }),
  ),
  body: Type.String({ description: "Comment body text." }),
});

type CommentParams = Static<typeof parameters>;

interface CommentDetails {
  path?: string;
  line?: number;
  endLine?: number;
}

export function registerCommentTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_comment",
    label: "Crit Comment",
    description:
      "Add an inline review comment to a file at a specific line or line range. " +
      "The comment is written to .crit.json and visible in the crit browser UI.",
    parameters,

    async execute(
      _toolCallId: string,
      params: CommentParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<CommentDetails>> {
      const author = resolveAuthor(ctx);
      const lineSpec = params.endLine
        ? `${params.path}:${params.line}-${params.endLine}`
        : `${params.path}:${params.line}`;

      const args = ["comment", "--author", author, lineSpec, params.body];
      const result = await critExec(pi, {
        args,
        cwd: ctx.cwd,
        signal,
        lockCritJson: true,
      });

      if (result.code !== 0) {
        throw new Error(
          `crit comment failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      const output = (result.stdout + result.stderr).trim() || "Comment added";

      return {
        content: [{ type: "text", text: output }],
        details: {
          path: params.path,
          line: params.line,
          endLine: params.endLine,
        },
      };
    },

    renderCall(params: CommentParams, theme: Theme) {
      const lineSpec = params.endLine
        ? `${params.path}:${params.line}-${params.endLine}`
        : `${params.path}:${params.line}`;

      return new ToolCallHeader(
        {
          toolName: "Crit",
          action: "comment",
          mainArg: lineSpec,
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
        return new Text(theme.fg("muted", "Adding comment..."), 0, 0);
      }

      const details = result.details as CommentDetails | undefined;
      const container = new Container();

      if (!details?.path) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Comment failed";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      const lineSpec = details.endLine
        ? `${details.path}:${details.line}-${details.endLine}`
        : `${details.path}:${details.line}`;

      container.addChild(
        new Text(theme.fg("success", `Comment added at ${lineSpec}`), 0, 0),
      );

      return container;
    },
  });
}
