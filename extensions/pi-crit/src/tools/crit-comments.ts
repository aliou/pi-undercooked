import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ToolCallHeader,
  type ToolCallHeaderOptionArg,
  ToolFooter,
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
import { configLoader } from "../config";

const parameters = Type.Object({
  file: Type.Optional(
    Type.String({
      description: "Filter comments to a specific file path.",
    }),
  ),
  unresolvedOnly: Type.Optional(
    Type.Boolean({
      description: "Only return unresolved comments.",
      default: false,
    }),
  ),
});

type CommentsParams = Static<typeof parameters>;

interface Comment {
  id: string;
  start_line: number;
  end_line: number;
  body: string;
  author: string;
  resolved: boolean;
  replies?: { id: string; body: string; author: string }[];
}

interface CritJson {
  files?: Record<string, { comments?: Comment[] }>;
}

interface CommentsDetails {
  totalComments?: number;
  totalFiles?: number;
  comments?: Record<string, Comment[]>;
}

async function readCommentsFromFile(
  cwd: string,
): Promise<Record<string, Comment[]>> {
  const config = configLoader.getConfig();
  const dir = config.outputDir || cwd;
  const critPath = join(dir, ".crit.json");

  let raw: string;
  try {
    raw = await readFile(critPath, "utf-8");
  } catch {
    throw new Error(
      "No .crit.json found. Start a review with crit_review or add comments with crit_comment first.",
    );
  }

  let data: CritJson;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse .crit.json");
  }

  const files = data.files ?? {};
  const result: Record<string, Comment[]> = {};

  for (const [filePath, fileData] of Object.entries(files)) {
    const comments = fileData.comments ?? [];
    if (comments.length > 0) {
      result[filePath] = comments;
    }
  }

  return result;
}

export function registerCommentsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_comments",
    label: "Crit Comments",
    description:
      "Read current review comments from .crit.json. Returns all comments grouped by file, optionally filtered by file path or resolved status.",
    parameters,

    async execute(
      _toolCallId: string,
      params: CommentsParams,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<CommentsDetails>> {
      const allComments = await readCommentsFromFile(ctx.cwd);

      const result: Record<string, Comment[]> = {};
      let totalComments = 0;

      for (const [filePath, comments] of Object.entries(allComments)) {
        if (params.file && filePath !== params.file) continue;

        const filtered = params.unresolvedOnly
          ? comments.filter((c) => !c.resolved)
          : comments;

        if (filtered.length > 0) {
          result[filePath] = filtered;
          totalComments += filtered.length;
        }
      }

      const output = JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: output }],
        details: {
          totalComments,
          totalFiles: Object.keys(result).length,
          comments: result,
        },
      };
    },

    renderCall(params: CommentsParams, theme: Theme) {
      const mainArg = params.file ?? "all files";
      const optionArgs: ToolCallHeaderOptionArg[] = [];
      if (params.unresolvedOnly)
        optionArgs.push({ label: "unresolved-only", value: "true" });

      return new ToolCallHeader(
        { toolName: "Crit", action: "comments", mainArg, optionArgs },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Reading comments..."), 0, 0);
      }

      const details = result.details as CommentsDetails | undefined;
      const container = new Container();

      if (details?.totalComments === undefined) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) ||
          "Failed to read comments";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      if (details.totalComments === 0) {
        container.addChild(
          new Text(theme.fg("muted", "No comments found"), 0, 0),
        );
        return container;
      }

      container.addChild(
        new Text(
          theme.fg(
            "success",
            `${details.totalComments} comment${details.totalComments === 1 ? "" : "s"} across ${details.totalFiles} file${details.totalFiles === 1 ? "" : "s"}`,
          ),
          0,
          0,
        ),
      );

      if (options.expanded && details.comments) {
        for (const [filePath, comments] of Object.entries(details.comments)) {
          container.addChild(new Text("", 0, 0));
          container.addChild(new Text(theme.fg("accent", filePath), 0, 0));
          for (const c of comments) {
            const status = c.resolved ? "[resolved]" : "[open]";
            const line =
              c.start_line === c.end_line
                ? `L${c.start_line}`
                : `L${c.start_line}-${c.end_line}`;
            container.addChild(
              new Text(
                `  ${c.id} ${line} ${status} ${c.body.slice(0, 80)}`,
                0,
                0,
              ),
            );
          }
        }
      }

      const footerItems = [
        { label: "comments", value: `${details.totalComments}` },
        { label: "files", value: `${details.totalFiles}` },
      ];

      container.addChild(new Text("", 0, 0));
      container.addChild(
        new ToolFooter(theme, { items: footerItems, separator: " | " }),
      );

      return container;
    },
  });
}
