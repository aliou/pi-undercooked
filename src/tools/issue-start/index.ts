import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  type IssueStartDetails,
  type IssueStartParams,
  runIssueStart,
} from "../../issue-start/run";

const IssueStartSchema = Type.Object({
  id: Type.String({
    description: "Issue ID or identifier (e.g. ENG-123).",
  }),
  updateState: Type.Optional(
    Type.Boolean({
      description: "Override default behavior for moving issue to In Progress.",
    }),
  ),
  createBranch: Type.Optional(
    Type.Boolean({
      description: "Override default behavior for creating local git branch.",
    }),
  ),
  allowDirty: Type.Optional(
    Type.Boolean({
      description:
        "Allow running while git working tree is dirty. If false, tool asks for confirmation.",
    }),
  ),
});

type Params = IssueStartParams;

type ExecuteResult = AgentToolResult<IssueStartDetails>;

export function registerIssueStartTool(pi: ExtensionAPI) {
  pi.registerTool<typeof IssueStartSchema, IssueStartDetails>({
    name: "linear_issue_start",
    label: "Linear: Issue Start",
    description:
      "Start implementation from an issue: optional state update + optional branch creation.",
    promptSnippet:
      "Use linear_issue_start to begin implementation from a Linear issue. It can move issue state and create a local branch.",
    promptGuidelines: [
      "Always pass id to linear_issue_start.",
      "Respect ask/true/false defaults from /linear:settings unless user overrides for linear_issue_start.",
      "If repo is dirty, ask user before proceeding with linear_issue_start.",
    ],
    parameters: IssueStartSchema,

    async execute(
      _toolCallId: string,
      params: Params,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<IssueStartDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      const result = await runIssueStart(pi, ctx, params, signal);
      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },

    renderCall(args: Params, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Linear Issue Start",
          action: "start",
          mainArg: args.id,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<IssueStartDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const details = result.details;
      const fallbackText = result.content[0];

      if (!details) {
        return new Text(
          fallbackText?.type === "text" ? fallbackText.text : "No result",
          0,
          0,
        );
      }

      if (details.error)
        return new Text(theme.fg("error", details.error), 0, 0);

      if (details.needsDecision) {
        return new Text(
          theme.fg("accent", details.decisionReason ?? "Decision required."),
          0,
          0,
        );
      }

      if (!details.issue) {
        return new Text(
          fallbackText?.type === "text" ? fallbackText.text : "Done.",
          0,
          0,
        );
      }

      const warningText = details.warnings?.join("\n");
      const body = new ToolBody(
        {
          fields: [
            {
              label: "Issue",
              value: `${details.issue.identifier} ${details.issue.title}`,
              showCollapsed: true,
            },
            { label: "Branch", value: details.branchName ?? "(none)" },
            {
              label: "State updated",
              value: details.stateUpdated ? "yes" : "no",
            },
            ...(warningText ? [{ label: "Warnings", value: warningText }] : []),
          ],
        },
        options,
        theme,
      );
      return body;
    },
  });
}
