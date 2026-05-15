import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Component, Spacer, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { prepareToolText } from "../output";
import { createIssueAttachment } from "./actions/attachment-create";
import { listIssueAttachments } from "./actions/attachments-list";
import { createIssueComment } from "./actions/comment-create";
import { deleteIssueComment } from "./actions/comment-delete";
import { updateIssueComment } from "./actions/comment-update";
import { listIssueComments } from "./actions/comments-list";
import { type CreateIssueParams, createIssue } from "./actions/create";
import { listIssueDocuments } from "./actions/documents-list";
import { type ListIssuesParams, listIssues } from "./actions/list";
import { createIssueRelation } from "./actions/relation-create";
import { deleteIssueRelation } from "./actions/relation-delete";
import { updateIssueRelation } from "./actions/relation-update";
import { listIssueRelations } from "./actions/relations-list";
import { type SearchIssuesParams, searchIssues } from "./actions/search";
import { type ShowIssueParams, showIssue } from "./actions/show";
import { type UpdateIssueParams, updateIssue } from "./actions/update";
import { renderIssueChildren, renderIssueExpanded } from "./render";
import type {
  SerializedAttachment,
  SerializedComment,
  SerializedDocument,
  SerializedIssue,
  SerializedIssueRelation,
} from "./types";

const actionValues = [
  "show",
  "create",
  "list",
  "search",
  "update",
  "comments_list",
  "comment_create",
  "comment_update",
  "comment_delete",
  "attachments_list",
  "attachment_create",
  "relations_list",
  "relation_create",
  "relation_update",
  "relation_delete",
  "documents_list",
] as const;

const IssuesParams = Type.Object({
  action: StringEnum([...actionValues], {
    description: "Issue action to perform.",
  }),
  id: Type.Optional(
    Type.String({
      description:
        "Issue ID or identifier (e.g. ENG-123). Required for show/update and issue-scoped actions.",
    }),
  ),
  commentId: Type.Optional(Type.String({ description: "Comment ID." })),
  relationId: Type.Optional(Type.String({ description: "Relation ID." })),
  relatedIssueId: Type.Optional(
    Type.String({ description: "Related issue ID or identifier." }),
  ),
  relationType: Type.Optional(
    Type.String({
      description:
        "Relation type: blocks, blocked_by, duplicate, related, or similar.",
    }),
  ),
  body: Type.Optional(Type.String({ description: "Comment markdown body." })),
  url: Type.Optional(Type.String({ description: "Attachment URL." })),
  includeInverseRelations: Type.Optional(
    Type.Boolean({
      description: "Include inverse relations when listing issue relations.",
    }),
  ),
  query: Type.Optional(
    Type.String({ description: "Search query. Required for search." }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum results to return for list/search." }),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({ description: "Include archived issues in list/search." }),
  ),
  stateId: Type.Optional(
    Type.String({
      description:
        "Workflow state ID. Prefer this for create/update. Resolve via linear_team_states first.",
    }),
  ),
  assigneeId: Type.Optional(
    Type.String({
      description:
        "Assignee user ID. Prefer this for create/update. Resolve via linear_people first.",
    }),
  ),
  projectId: Type.Optional(Type.String({ description: "Project ID." })),
  projectMilestoneId: Type.Optional(
    Type.String({ description: "Project milestone ID." }),
  ),
  teamId: Type.Optional(
    Type.String({
      description:
        "Team ID (UUID). For create, required unless defaultTeamKey is configured. For list/search, can use teamKey instead.",
    }),
  ),
  teamKey: Type.Optional(
    Type.String({
      description: "Team key (e.g. ENG). Used as filter for list/search.",
    }),
  ),
  labelId: Type.Optional(Type.String({ description: "Label ID." })),
  title: Type.Optional(
    Type.String({ description: "Issue title or attachment title." }),
  ),
  description: Type.Optional(
    Type.String({ description: "Issue description in markdown." }),
  ),
  priority: Type.Optional(
    Type.Number({
      description: "Priority: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low.",
      minimum: 0,
      maximum: 4,
    }),
  ),
  labelIds: Type.Optional(
    Type.Array(Type.String(), { description: "Label IDs." }),
  ),
  dueDate: Type.Optional(
    Type.String({ description: "Due date (YYYY-MM-DD)." }),
  ),
  estimate: Type.Optional(Type.Number({ description: "Complexity estimate." })),
  parentId: Type.Optional(
    Type.String({ description: "Parent issue ID for sub-issues." }),
  ),
  includeCompleted: Type.Optional(
    Type.Boolean({
      description: "Include issues in completed states. Default false.",
    }),
  ),
  includeCanceled: Type.Optional(
    Type.Boolean({
      description:
        "Include issues in canceled/duplicate states. Default false.",
    }),
  ),
  includeSubIssues: Type.Optional(
    Type.Boolean({
      description: "Include sub-issues (issues with a parent). Default false.",
    }),
  ),
});

type IssuesParamsType = Static<typeof IssuesParams>;

interface IssuesDetails {
  action: string;
  issue?: SerializedIssue;
  children?: SerializedIssue[];
  issues?: SerializedIssue[];
  comments?: SerializedComment[];
  attachments?: SerializedAttachment[];
  relations?: SerializedIssueRelation[];
  documents?: SerializedDocument[];
  totalCount?: number;
  deleted?: boolean;
  error?: string;
}

type ExecuteResult = AgentToolResult<IssuesDetails>;

const COLLAPSED_MAX = 5;
const CONTENT_MAX = 20;

function formatIssueForContent(issue: SerializedIssue): string {
  const parts = [
    `${issue.identifier}: ${issue.title}`,
    `status=${issue.state}`,
    `priority=${issue.priorityLabel}`,
    `team=${issue.team}`,
  ];
  if (issue.project) parts.push(`project=${issue.project}`);
  if (issue.milestone) parts.push(`milestone=${issue.milestone}`);
  if (issue.assignee) parts.push(`assignee=${issue.assignee}`);
  if (issue.parentId) parts.push(`parentId=${issue.parentId}`);
  parts.push(`url=${issue.url}`);
  return parts.join(" | ");
}

function formatIssueListContent(
  issues: SerializedIssue[],
  action: string,
  totalCount?: number,
): string {
  const header =
    action === "search" && typeof totalCount === "number"
      ? `Found ${totalCount} issues. Showing ${issues.length}.`
      : `Listed ${issues.length} issues.`;

  if (issues.length === 0) return header;

  const lines = issues
    .slice(0, CONTENT_MAX)
    .map((issue) => `- ${formatIssueForContent(issue)}`);
  if (issues.length > CONTENT_MAX)
    lines.push(`- + ${issues.length - CONTENT_MAX} more`);
  return `${header}\n${lines.join("\n")}`;
}

function renderIssueOneLiner(issue: SerializedIssue, theme: Theme): Text {
  const parts = [
    `${theme.fg("accent", theme.bold(issue.identifier))} ${issue.title}`,
    issue.state,
    issue.priorityLabel,
  ];
  if (issue.assignee)
    parts.push(`${theme.fg("muted", "Assignee: ")}${issue.assignee}`);
  return new Text(parts.join(theme.fg("dim", " | ")), 0, 0);
}

function renderIssueListItem(issue: SerializedIssue, theme: Theme): Text {
  const line1 = `${theme.fg("accent", theme.bold(issue.identifier))} ${issue.title}`;
  const meta = [
    `${theme.fg("muted", "Status: ")}${issue.state}`,
    `${theme.fg("muted", "Priority: ")}${issue.priorityLabel}`,
  ];
  if (issue.assignee)
    meta.push(`${theme.fg("muted", "Assignee: ")}${issue.assignee}`);
  if (issue.project)
    meta.push(`${theme.fg("muted", "Project: ")}${issue.project}`);
  if (issue.milestone)
    meta.push(`${theme.fg("muted", "Milestone: ")}${issue.milestone}`);
  return new Text(`${line1}\n${meta.join(theme.fg("dim", " | "))}`, 0, 0);
}

function linesFromGenericItems(items: string[], noun: string): string {
  if (items.length === 0) return `No ${noun} found.`;
  const lines = items.slice(0, CONTENT_MAX).map((line) => `- ${line}`);
  if (items.length > CONTENT_MAX)
    lines.push(`- + ${items.length - CONTENT_MAX} more`);
  return lines.join("\n");
}

export function registerIssuesTool(pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "linear_issues",
      label: "Linear: Issues",
      description:
        "Manage Linear issues, comments, attachments, relations, and linked docs.",
      promptSnippet:
        "Use linear_issues to create, list, search, show, or update Linear issues and their comments, attachments, relations, and linked documents.",
      promptGuidelines: [
        "Prefer linear_issues search over list when looking for specific issues.",
        "Use teamKey instead of teamId for linear_issues when possible.",
        "Always supply id for linear_issues show/update.",
        "For linear_issues create/update assignment or state changes, call linear_people and linear_team_states first, then pass assigneeId/stateId.",
      ],
      parameters: IssuesParams,
      executionMode: "sequential",

      async execute(
        _toolCallId: string,
        params: IssuesParamsType,
        _signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<IssuesDetails> | undefined,
        _ctx: ExtensionContext,
      ): Promise<ExecuteResult> {
        const client = getLinearClient();
        if (!client) {
          return {
            content: [{ type: "text", text: LINEAR_CREDENTIALS_ERROR }],
            details: { action: params.action, error: LINEAR_CREDENTIALS_ERROR },
          };
        }

        onUpdate?.({
          content: [
            { type: "text", text: `Running issues.${params.action}...` },
          ],
          details: { action: params.action },
        });

        let details: IssuesDetails;
        let text = "";

        switch (params.action) {
          case "show": {
            const result = await showIssue(
              client,
              params as unknown as ShowIssueParams,
            );
            if (result.error) {
              details = { action: params.action, error: result.error };
              break;
            }
            const issue = result.issue as SerializedIssue;
            const children = result.children;
            const summary = [
              `Found issue ${issue.identifier}: ${issue.title}`,
              `Status: ${issue.state} | Priority: ${issue.priorityLabel} | Team: ${issue.team}`,
            ];
            if (issue.project) summary.push(`Project: ${issue.project}`);
            if (issue.milestone) summary.push(`Milestone: ${issue.milestone}`);
            if (issue.assignee) summary.push(`Assignee: ${issue.assignee}`);
            if (issue.branchName)
              summary.push(`Suggested branch: ${issue.branchName}`);
            summary.push(`URL: ${issue.url}`);
            if (issue.description) summary.push(`\n${issue.description}`);
            if (children && children.length > 0) {
              summary.push(`\nSub-issues (${children.length}):`);
              for (const child of children) {
                summary.push(
                  `  ${child.identifier}: ${child.title} | ${child.state} | ${child.priorityLabel}`,
                );
              }
            }
            text = summary.join("\n");
            details = { action: params.action, issue, children };
            break;
          }
          case "create": {
            const result = await createIssue(
              client,
              params as unknown as CreateIssueParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, issue: result.issue };
            if (result.issue)
              text = `Created issue ${result.issue.identifier}: ${result.issue.title}`;
            break;
          }
          case "update": {
            const result = await updateIssue(
              client,
              params as unknown as UpdateIssueParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, issue: result.issue };
            if (result.issue)
              text = `Updated issue ${result.issue.identifier}: ${result.issue.title}`;
            break;
          }
          case "list": {
            const listParams = params as unknown as ListIssuesParams;
            const result = await listIssues(client, {
              ...listParams,
              includeCompleted: listParams.includeCompleted ?? false,
              includeCanceled: listParams.includeCanceled ?? false,
              includeSubIssues: listParams.includeSubIssues ?? true,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, issues: result.issues };
            text = result.issues
              ? formatIssueListContent(result.issues, params.action)
              : "";
            break;
          }
          case "search": {
            const result = await searchIssues(
              client,
              params as unknown as SearchIssuesParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : {
                  action: params.action,
                  issues: result.issues,
                  totalCount: result.totalCount,
                };
            text = result.issues
              ? formatIssueListContent(
                  result.issues,
                  params.action,
                  result.totalCount,
                )
              : "";
            break;
          }
          case "comments_list": {
            const result = await listIssueComments(client, {
              issueId: String(params.id ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, comments: result.comments };
            text = result.comments
              ? `Listed ${result.comments.length} comments.\n${linesFromGenericItems(
                  result.comments.map(
                    (comment) =>
                      `${comment.userName ?? "Unknown"}: ${comment.body}`,
                  ),
                  "comments",
                )}`
              : "";
            break;
          }
          case "comment_create": {
            const result = await createIssueComment(client, {
              issueId: String(params.id ?? ""),
              body: String(params.body ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : {
                  action: params.action,
                  comments: result.comment ? [result.comment] : [],
                };
            if (result.comment) text = `Created comment ${result.comment.id}.`;
            break;
          }
          case "comment_update": {
            const result = await updateIssueComment(client, {
              id: String(params.commentId ?? ""),
              body: String(params.body ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : {
                  action: params.action,
                  comments: result.comment ? [result.comment] : [],
                };
            if (result.comment) text = `Updated comment ${result.comment.id}.`;
            break;
          }
          case "comment_delete": {
            const result = await deleteIssueComment(client, {
              id: String(params.commentId ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, deleted: result.deleted };
            text = result.deleted
              ? `Deleted comment ${String(params.commentId ?? "")}.`
              : "";
            break;
          }
          case "attachments_list": {
            const result = await listIssueAttachments(client, {
              issueId: String(params.id ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, attachments: result.attachments };
            text = result.attachments
              ? `Listed ${result.attachments.length} attachments.\n${linesFromGenericItems(
                  result.attachments.map(
                    (attachment) => `${attachment.title} | ${attachment.url}`,
                  ),
                  "attachments",
                )}`
              : "";
            break;
          }
          case "attachment_create": {
            const result = await createIssueAttachment(client, {
              issueId: String(params.id ?? ""),
              url: String(params.url ?? ""),
              title:
                typeof params.title === "string" ? params.title : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : {
                  action: params.action,
                  attachments: result.attachment ? [result.attachment] : [],
                };
            if (result.attachment)
              text = `Created attachment ${result.attachment.title}.`;
            break;
          }
          case "relations_list": {
            const result = await listIssueRelations(client, {
              issueId: String(params.id ?? ""),
              includeInverseRelations: Boolean(params.includeInverseRelations),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, relations: result.relations };
            text = result.relations
              ? `Listed ${result.relations.length} relations.\n${linesFromGenericItems(
                  result.relations.map((relation) =>
                    `${relation.type} ${relation.relatedIssueIdentifier ?? relation.relatedIssueId ?? "unknown"} ${relation.relatedIssueTitle ?? ""}`.trim(),
                  ),
                  "relations",
                )}`
              : "";
            break;
          }
          case "relation_create": {
            const result = await createIssueRelation(client, {
              issueId: String(params.id ?? ""),
              relatedIssueId: String(params.relatedIssueId ?? ""),
              type: String(params.relationType ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : {
                  action: params.action,
                  relations: result.relation ? [result.relation] : [],
                };
            if (result.relation)
              text = `Created relation ${result.relation.type}.`;
            break;
          }
          case "relation_update": {
            const result = await updateIssueRelation(client, {
              id: String(params.relationId ?? ""),
              type:
                typeof params.relationType === "string"
                  ? params.relationType
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : {
                  action: params.action,
                  relations: result.relation ? [result.relation] : [],
                };
            if (result.relation)
              text = `Updated relation ${result.relation.id}.`;
            break;
          }
          case "relation_delete": {
            const result = await deleteIssueRelation(client, {
              id: String(params.relationId ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, deleted: result.deleted };
            text = result.deleted
              ? `Deleted relation ${String(params.relationId ?? "")}.`
              : "";
            break;
          }
          case "documents_list": {
            const result = await listIssueDocuments(client, {
              issueId: String(params.id ?? ""),
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, documents: result.documents };
            text = result.documents
              ? `Listed ${result.documents.length} documents.\n${linesFromGenericItems(
                  result.documents.map(
                    (document) => `${document.title} | ${document.url}`,
                  ),
                  "documents",
                )}`
              : "";
            break;
          }
          default:
            details = {
              action: params.action,
              error: `Unknown action: ${params.action}`,
            };
        }

        if (details.error) {
          return {
            content: [{ type: "text", text: `Error: ${details.error}` }],
            details,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: await prepareToolText(text || "Done.", "linear_issues"),
            },
          ],
          details,
        };
      },

      renderCall(args: IssuesParamsType, theme: Theme) {
        const action = String(args.action ?? "");
        const mainArg =
          String(
            args.title ??
              args.id ??
              args.query ??
              args.commentId ??
              args.relationId ??
              args.relatedIssueId ??
              "",
          ) || undefined;
        return new ToolCallHeader(
          {
            toolName: "Linear Issues",
            action: action.replaceAll("_", " "),
            mainArg,
          },
          theme,
        );
      },

      renderResult(
        result: AgentToolResult<IssuesDetails>,
        options: ToolRenderResultOptions,
        theme: Theme,
      ) {
        const { details } = result;
        const fallbackText = result.content[0];

        if (!details) {
          return new Text(
            fallbackText?.type === "text" && fallbackText.text
              ? fallbackText.text
              : "No result",
            0,
            0,
          );
        }

        if (details.error) {
          return new Text(theme.fg("error", details.error), 0, 0);
        }

        if (details.issues) {
          const fields: Array<
            | { label: string; value: string; showCollapsed?: boolean }
            | (Component & { showCollapsed?: boolean })
          > = [];

          if (options.expanded) {
            details.issues.forEach((issue, index) => {
              if (index > 0) fields.push(new Spacer(1));
              fields.push(renderIssueListItem(issue, theme));
            });
          } else {
            const summaryLabel = `${details.issues.length} issue${details.issues.length === 1 ? "" : "s"}`;
            const summaryText = new Text(
              theme.fg("accent", theme.bold(summaryLabel)),
              0,
              0,
            );
            Object.assign(summaryText, { showCollapsed: true });
            fields.push(summaryText);

            const collapsedSlice = details.issues.slice(0, COLLAPSED_MAX);
            for (const issue of collapsedSlice) {
              const line = renderIssueOneLiner(issue, theme);
              Object.assign(line, { showCollapsed: true });
              fields.push(line);
            }
            if (details.issues.length > COLLAPSED_MAX) {
              const more = new Text(
                theme.fg(
                  "dim",
                  `+ ${details.issues.length - COLLAPSED_MAX} more`,
                ),
                0,
                0,
              );
              Object.assign(more, { showCollapsed: true });
              fields.push(more);
            }
          }

          const footerItems = [];
          if (options.expanded) {
            if (
              details.action === "search" &&
              typeof details.totalCount === "number"
            ) {
              footerItems.push({
                value: `${details.totalCount} matches`,
                tone: "accent" as const,
              });
            }
            footerItems.push({
              value: `${details.issues.length} issue${details.issues.length === 1 ? "" : "s"}`,
              tone: "muted" as const,
            });
          }

          return new ToolBody(
            {
              fields,
              footer:
                footerItems.length > 0
                  ? new ToolFooter(theme, { items: footerItems })
                  : undefined,
              includeSpacerBeforeFooter: fields.length > 0,
            },
            options,
            theme,
          );
        }

        if (details.issue) {
          const issue = details.issue;
          const titleText = new Text(
            `${theme.fg("accent", theme.bold(issue.identifier))} ${issue.title}`,
            0,
            0,
          );
          Object.assign(titleText, { showCollapsed: true });

          const fields: Array<
            | { label: string; value: string; showCollapsed?: boolean }
            | (Component & { showCollapsed?: boolean })
          > = [titleText];

          if (options.expanded) {
            for (const component of renderIssueExpanded(issue, theme))
              fields.push(component);
            if (details.children && details.children.length > 0) {
              fields.push(...renderIssueChildren(details.children, theme));
            }
          }

          return new ToolBody(
            {
              fields,
              footer: new ToolFooter(theme, {
                items: [
                  { label: "Status", value: issue.state, tone: "accent" },
                  {
                    label: "Priority",
                    value: issue.priorityLabel,
                    tone: "muted",
                  },
                ],
              }),
            },
            options,
            theme,
          );
        }

        return new Text(
          fallbackText?.type === "text" && fallbackText.text
            ? fallbackText.text
            : "Done.",
          0,
          0,
        );
      },
    }),
  );
}
