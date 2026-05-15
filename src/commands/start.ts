import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { getLinearClient } from "../client";
import { runIssueStart } from "../issue-start/run";
import { listIssues } from "../tools/issues/actions/list";
import { serializeIssue } from "../tools/issues/serialize";
import type { SerializedIssue } from "../tools/issues/types";
import { StartIssuePickerComponent } from "./start-picker-component";

interface StartContextPayload {
  message: string;
  issue: SerializedIssue;
  parentIssue?: SerializedIssue;
}

async function buildStartContextPayload(
  issueId: string,
): Promise<StartContextPayload | null> {
  const client = getLinearClient();
  if (!client) return null;

  const issueEntity = await client.issue(issueId);
  const issue = await serializeIssue(issueEntity);
  const [state, assignee, project, team, milestone, labels] = await Promise.all(
    [
      issueEntity.state,
      issueEntity.assignee,
      issueEntity.project,
      issueEntity.team,
      issueEntity.projectMilestone,
      issueEntity.labels(),
    ],
  );

  let parentIssue: SerializedIssue | undefined;
  if (issueEntity.parentId) {
    const parent = await client.issue(issueEntity.parentId);
    parentIssue = await serializeIssue(parent);
  }

  const lines = [
    `Started implementation for ${issue.identifier}: ${issue.title}`,
    "",
    "## Issue context",
    `- State: ${state?.name ?? "Unknown"}`,
    `- Team: ${team?.name ?? "Unknown"}`,
    assignee?.displayName ? `- Assignee: ${assignee.displayName}` : "",
    project?.name ? `- Project: ${project.name}` : "",
    milestone?.name ? `- Milestone: ${milestone.name}` : "",
    labels.nodes.length > 0
      ? `- Labels: ${labels.nodes.map((label) => label.name).join(", ")}`
      : "",
    "",
    issue.description ?? "(No description)",
    "",
    issue.url,
    parentIssue
      ? [
          "",
          "## Parent issue",
          `- ${parentIssue.identifier}: ${parentIssue.title}`,
          parentIssue.description ?? "(No description)",
          parentIssue.url,
        ].join("\n")
      : "",
    "",
    "Please continue implementation based on this issue context.",
  ].filter(Boolean);

  return {
    message: lines.join("\n"),
    issue,
    parentIssue,
  };
}

export function registerLinearStart(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(
    "linear-start-issue",
    (message, options, theme) => {
      const details = message.details as
        | { issue?: SerializedIssue; parentIssue?: SerializedIssue }
        | undefined;

      const fallback =
        typeof message.content === "string" ? message.content : "";
      if (!details?.issue) return new Text(fallback, 0, 0);

      const issue = details.issue;
      const lines = [
        `${theme.fg("accent", theme.bold(issue.identifier))} ${issue.title}`,
        `${theme.fg("muted", "Status: ")}${issue.state} ${theme.fg("dim", "| ")}${theme.fg("muted", "Priority: ")}${issue.priorityLabel}`,
      ];

      if (options.expanded) {
        if (issue.assignee)
          lines.push(`${theme.fg("muted", "Assignee: ")}${issue.assignee}`);
        if (issue.project)
          lines.push(`${theme.fg("muted", "Project: ")}${issue.project}`);
        if (issue.milestone)
          lines.push(`${theme.fg("muted", "Milestone: ")}${issue.milestone}`);
        if (issue.description) lines.push("", issue.description);
        lines.push("", theme.fg("muted", issue.url));

        if (details.parentIssue) {
          const parent = details.parentIssue;
          lines.push(
            "",
            theme.fg("muted", "Parent issue"),
            `${theme.fg("accent", theme.bold(parent.identifier))} ${parent.title}`,
          );
          if (parent.description) lines.push(parent.description);
          lines.push(theme.fg("muted", parent.url));
        }
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  );
  pi.registerCommand("linear:start", {
    description:
      "Start implementation from a Linear issue. Usage: /linear:start [ENG-123]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      let id = args.trim();

      if (!id) {
        if (!ctx.hasUI) {
          ctx.ui.notify(
            "Issue id is required in non-interactive mode. Usage: /linear:start ENG-123",
            "error",
          );
          return;
        }

        const client = getLinearClient();
        if (!client) {
          ctx.ui.notify("Linear credentials not configured.", "error");
          return;
        }

        const viewer = await client.viewer;

        const selected = await ctx.ui.custom<string | null>(
          (tui, theme, _kb, done) => {
            return new StartIssuePickerComponent(
              tui,
              theme,
              (issueId) => done(issueId ?? null),
              async (filters) => {
                const result = await listIssues(client, {
                  limit: 100,
                  includeArchived: false,
                  includeCompleted: filters.includeCompleted,
                  includeCanceled: false,
                  includeSubIssues: true,
                  assigneeId: filters.mineOnly ? viewer.id : undefined,
                });
                return {
                  issues: result.issues ?? [],
                  error: result.error,
                };
              },
            );
          },
        );

        if (selected === undefined) {
          ctx.ui.notify(
            "Interactive issue picker unavailable. Pass an issue id, e.g. /linear:start ENG-123.",
            "warning",
          );
          return;
        }

        if (selected === null) {
          ctx.ui.notify("Canceled.", "info");
          return;
        }

        const confirmed = await ctx.ui.confirm(
          "Start issue",
          `Start implementation flow for ${selected}?`,
        );
        if (!confirmed) {
          ctx.ui.notify("Canceled.", "info");
          return;
        }

        id = selected;
      }

      const result = await runIssueStart(pi, ctx, { id }, undefined);
      const tone = result.details.error ? "error" : "info";
      ctx.ui.notify(result.text, tone);

      if (!result.details.error && result.details.issue) {
        const payload = await buildStartContextPayload(result.details.issue.id);
        if (payload) {
          pi.sendMessage({
            customType: "linear-start-issue",
            content: `Context loaded for ${payload.issue.identifier}`,
            display: true,
            details: {
              issue: payload.issue,
              parentIssue: payload.parentIssue,
            },
          });
          await pi.sendUserMessage(payload.message, { deliverAs: "followUp" });
        }
      }
    },
  });
}
