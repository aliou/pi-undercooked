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
  files: Type.Array(Type.String(), {
    description: "Files to share for review.",
  }),
});

type ShareParams = Static<typeof parameters>;

interface ShareDetails {
  url?: string;
}

export function registerShareTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_share",
    label: "Crit Share",
    description:
      "Share files for review via crit-web. Returns a public URL where the review can be accessed.",
    parameters,

    async execute(
      _toolCallId: string,
      params: ShareParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<ShareDetails>> {
      const args = ["share", ...params.files];
      const result = await critExec(pi, {
        args,
        cwd: ctx.cwd,
        signal,
        includeShareUrl: true,
        lockCritJson: true,
      });

      if (result.code !== 0) {
        throw new Error(
          `crit share failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      const output = (result.stdout + result.stderr).trim();
      const urlMatch = output.match(/https?:\/\/\S+/);

      return {
        content: [{ type: "text", text: output }],
        details: { url: urlMatch?.[0] },
      };
    },

    renderCall(params: ShareParams, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Crit",
          action: "share",
          mainArg: params.files.join(", "),
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
        return new Text(theme.fg("muted", "Sharing..."), 0, 0);
      }

      const details = result.details as ShareDetails | undefined;
      const container = new Container();

      if (!details?.url) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Share failed";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      container.addChild(
        new Text(theme.fg("success", `Shared: ${details.url}`), 0, 0),
      );

      return container;
    },
  });
}
