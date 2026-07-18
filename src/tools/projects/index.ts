import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Component, Spacer, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { prepareToolText } from "../output";
import { type CreateProjectParams, createProject } from "./actions/create";
import { type ListProjectsParams, listProjects } from "./actions/list";
import { createProjectRelation } from "./actions/relation-create";
import { deleteProjectRelation } from "./actions/relation-delete";
import { updateProjectRelation } from "./actions/relation-update";
import { listProjectRelations } from "./actions/relations-list";
import { type ShowProjectParams, showProject } from "./actions/show";
import { type UpdateProjectParams, updateProject } from "./actions/update";
import type { SerializedProjectRelation } from "./milestone-types";
import { renderProjectExpanded } from "./render";
import type { SerializedProject } from "./types";

const actionValues = [
  "show",
  "create",
  "list",
  "update",
  "relations_list",
  "relation_create",
  "relation_update",
  "relation_delete",
] as const;

const ProjectsParams = Type.Object({
  action: StringEnum([...actionValues], {
    description: "Project action to perform.",
  }),
  id: Type.Optional(
    Type.String({
      description:
        "Project ID. Required for show/update and project relation actions.",
    }),
  ),
  relationId: Type.Optional(
    Type.String({ description: "Project relation ID." }),
  ),
  relatedProjectId: Type.Optional(
    Type.String({ description: "Related project ID." }),
  ),
  anchorType: Type.Optional(
    Type.String({ description: "Project anchor type. Default project." }),
  ),
  relatedAnchorType: Type.Optional(
    Type.String({
      description: "Related project anchor type. Default project.",
    }),
  ),
  projectMilestoneId: Type.Optional(
    Type.String({ description: "Project milestone ID for project relations." }),
  ),
  relatedProjectMilestoneId: Type.Optional(
    Type.String({
      description: "Related project milestone ID for project relations.",
    }),
  ),
  type: Type.Optional(Type.String({ description: "Relation type." })),
  limit: Type.Optional(
    Type.Number({ description: "Maximum results to return for list." }),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({ description: "Include archived projects in list actions." }),
  ),
  statusId: Type.Optional(Type.String({ description: "Project status ID." })),
  leadId: Type.Optional(Type.String({ description: "Project lead user ID." })),
  teamId: Type.Optional(Type.String({ description: "Team ID." })),
  teamKey: Type.Optional(Type.String({ description: "Team key, e.g. ENG." })),
  name: Type.Optional(Type.String({ description: "Project name." })),
  teamIds: Type.Optional(
    Type.Array(Type.String(), {
      description: "Team IDs to associate with the project.",
    }),
  ),
  description: Type.Optional(
    Type.String({ description: "Project description." }),
  ),
  priority: Type.Optional(
    Type.Number({
      description: "Priority: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low.",
      minimum: 0,
      maximum: 4,
    }),
  ),
  startDate: Type.Optional(
    Type.String({ description: "Start date (YYYY-MM-DD)." }),
  ),
  targetDate: Type.Optional(
    Type.String({ description: "Target date (YYYY-MM-DD)." }),
  ),
  content: Type.Optional(
    Type.String({ description: "Project content in markdown." }),
  ),
});

type ProjectsParamsType = Static<typeof ProjectsParams>;

interface ProjectsDetails {
  action: string;
  project?: SerializedProject;
  projects?: SerializedProject[];
  relation?: SerializedProjectRelation;
  relations?: SerializedProjectRelation[];
  deleted?: boolean;
  error?: string;
}

type ExecuteResult = AgentToolResult<ProjectsDetails>;
const COLLAPSED_MAX = 5;
const CONTENT_MAX = 20;

function formatProjectForContent(project: SerializedProject): string {
  const parts = [
    `${project.name} (id=${project.id})`,
    `status=${project.state}`,
    `priority=${project.priorityLabel}`,
    `progress=${Math.round(project.progress * 100)}%`,
  ];
  if (project.lead) parts.push(`lead=${project.lead}`);
  if (project.teams.length > 0) parts.push(`teams=${project.teams.join(", ")}`);
  parts.push(`url=${project.url}`);
  return parts.join(" | ");
}

function formatProjectListContent(projects: SerializedProject[]): string {
  const header = `Listed ${projects.length} projects.`;
  if (projects.length === 0) return header;
  const lines = projects
    .slice(0, CONTENT_MAX)
    .map((project) => `- ${formatProjectForContent(project)}`);
  if (projects.length > CONTENT_MAX) {
    lines.push(`- + ${projects.length - CONTENT_MAX} more`);
  }
  return `${header}\n${lines.join("\n")}`;
}

function renderProjectOneLiner(project: SerializedProject, theme: Theme): Text {
  const parts = [
    theme.fg("accent", theme.bold(project.name)),
    project.state,
    `${Math.round(project.progress * 100)}%`,
  ];
  return new Text(parts.join(theme.fg("dim", " | ")), 0, 0);
}

function renderProjectListItem(project: SerializedProject, theme: Theme): Text {
  const titleParts = [theme.fg("accent", theme.bold(project.name))];
  if (project.description) {
    titleParts.push(theme.fg("dim", project.description));
  }
  const meta = [
    `${theme.fg("muted", "Status: ")}${project.state}`,
    `${theme.fg("muted", "Priority: ")}${project.priorityLabel}`,
    `${theme.fg("muted", "Progress: ")}${Math.round(project.progress * 100)}%`,
  ];
  if (project.lead) {
    meta.push(`${theme.fg("muted", "Lead: ")}${project.lead}`);
  }
  return new Text(
    `${titleParts.join(" - ")}\n${meta.join(theme.fg("dim", " | "))}`,
    0,
    0,
  );
}

function formatLines(items: string[], emptyLabel: string): string {
  if (items.length === 0) return emptyLabel;
  const lines = items.slice(0, CONTENT_MAX).map((item) => `- ${item}`);
  if (items.length > CONTENT_MAX) {
    lines.push(`- + ${items.length - CONTENT_MAX} more`);
  }
  return lines.join("\n");
}

export function registerProjectsTool(pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "linear_projects",
      label: "Linear: Projects",
      description: "Manage Linear projects and project relations.",
      promptSnippet:
        "Use linear_projects to create, list, show, or update Linear projects and their relations.",
      promptGuidelines: [
        "Use teamKey instead of teamId for linear_projects when possible.",
        "Supply id for linear_projects show/update.",
        "Use linear_projects list to discover available projects.",
      ],
      parameters: ProjectsParams,
      executionMode: "sequential",

      async execute(
        _toolCallId,
        params,
        _signal,
        onUpdate,
        _ctx,
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
            { type: "text", text: `Running projects.${params.action}...` },
          ],
          details: { action: params.action },
        });

        let details: ProjectsDetails;
        let text = "";

        switch (params.action) {
          case "show": {
            const result = await showProject(
              client,
              params as unknown as ShowProjectParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, project: result.project };
            if (result.project) {
              text = JSON.stringify(
                {
                  id: result.project.id,
                  name: result.project.name,
                  state: result.project.state,
                  priority: result.project.priorityLabel,
                  progress: Math.round(result.project.progress * 100),
                  lead: result.project.lead,
                  teams: result.project.teams,
                  startDate: result.project.startDate,
                  targetDate: result.project.targetDate,
                  links: result.project.links,
                  documents: result.project.documents,
                  url: result.project.url,
                },
                null,
                2,
              );
            }
            break;
          }
          case "create": {
            const result = await createProject(
              client,
              params as unknown as CreateProjectParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, project: result.project };
            if (result.project) {
              text = JSON.stringify(
                {
                  id: result.project.id,
                  name: result.project.name,
                  state: result.project.state,
                  priority: result.project.priorityLabel,
                  progress: Math.round(result.project.progress * 100),
                  lead: result.project.lead,
                  teams: result.project.teams,
                  startDate: result.project.startDate,
                  targetDate: result.project.targetDate,
                  links: result.project.links,
                  documents: result.project.documents,
                  url: result.project.url,
                },
                null,
                2,
              );
            }
            break;
          }
          case "update": {
            const result = await updateProject(
              client,
              params as unknown as UpdateProjectParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, project: result.project };
            if (result.project) {
              text = JSON.stringify(
                {
                  id: result.project.id,
                  name: result.project.name,
                  state: result.project.state,
                  priority: result.project.priorityLabel,
                  progress: Math.round(result.project.progress * 100),
                  lead: result.project.lead,
                  teams: result.project.teams,
                  startDate: result.project.startDate,
                  targetDate: result.project.targetDate,
                  links: result.project.links,
                  documents: result.project.documents,
                  url: result.project.url,
                },
                null,
                2,
              );
            }
            break;
          }
          case "list": {
            const result = await listProjects(
              client,
              params as unknown as ListProjectsParams,
            );
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, projects: result.projects };
            text = result.projects
              ? formatProjectListContent(result.projects)
              : "";
            break;
          }
          case "relations_list": {
            const result = await listProjectRelations(client, {
              id: typeof params.id === "string" ? params.id : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, relations: result.relations };
            text = result.relations
              ? `Listed ${result.relations.length} project relations.\n${formatLines(
                  result.relations.map(
                    (relation) =>
                      `${relation.type} ${relation.relatedProjectName ?? relation.relatedProjectId}`,
                  ),
                  "No project relations found.",
                )}`
              : "";
            break;
          }
          case "relation_create": {
            const result = await createProjectRelation(client, {
              projectId: typeof params.id === "string" ? params.id : undefined,
              relatedProjectId:
                typeof params.relatedProjectId === "string"
                  ? params.relatedProjectId
                  : undefined,
              type: typeof params.type === "string" ? params.type : undefined,
              anchorType:
                typeof params.anchorType === "string"
                  ? params.anchorType
                  : undefined,
              relatedAnchorType:
                typeof params.relatedAnchorType === "string"
                  ? params.relatedAnchorType
                  : undefined,
              projectMilestoneId:
                typeof params.projectMilestoneId === "string"
                  ? params.projectMilestoneId
                  : undefined,
              relatedProjectMilestoneId:
                typeof params.relatedProjectMilestoneId === "string"
                  ? params.relatedProjectMilestoneId
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, relation: result.relation };
            if (result.relation) {
              text = `Created project relation ${result.relation.type}.`;
            }
            break;
          }
          case "relation_update": {
            const result = await updateProjectRelation(client, {
              relationId:
                typeof params.relationId === "string"
                  ? params.relationId
                  : undefined,
              projectId: typeof params.id === "string" ? params.id : undefined,
              relatedProjectId:
                typeof params.relatedProjectId === "string"
                  ? params.relatedProjectId
                  : undefined,
              type: typeof params.type === "string" ? params.type : undefined,
              anchorType:
                typeof params.anchorType === "string"
                  ? params.anchorType
                  : undefined,
              relatedAnchorType:
                typeof params.relatedAnchorType === "string"
                  ? params.relatedAnchorType
                  : undefined,
              projectMilestoneId:
                typeof params.projectMilestoneId === "string"
                  ? params.projectMilestoneId
                  : undefined,
              relatedProjectMilestoneId:
                typeof params.relatedProjectMilestoneId === "string"
                  ? params.relatedProjectMilestoneId
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, relation: result.relation };
            if (result.relation) {
              text = `Updated project relation ${result.relation.id}.`;
            }
            break;
          }
          case "relation_delete": {
            const result = await deleteProjectRelation(client, {
              relationId:
                typeof params.relationId === "string"
                  ? params.relationId
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, deleted: result.deleted };
            if (result.deleted) {
              text = `Deleted project relation ${String(params.relationId ?? "")}.`;
            }
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
              text: await prepareToolText(text || "Done.", "linear_projects"),
            },
          ],
          details,
        };
      },

      renderCall(args: ProjectsParamsType, theme: Theme) {
        const action = String(args.action ?? "");
        const mainArg =
          String(args.name ?? args.id ?? args.relationId ?? "") || undefined;
        return new ToolCallHeader(
          {
            toolName: "Linear Projects",
            action: action.replaceAll("_", " "),
            mainArg,
          },
          theme,
        );
      },

      renderResult(
        result: AgentToolResult<ProjectsDetails>,
        options: ToolRenderResultOptions,
        theme: Theme,
      ) {
        if (options.isPartial) {
          return new Text(
            theme.fg("muted", "Linear projects running..."),
            0,
            0,
          );
        }

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

        if (details.projects) {
          const fields: Array<
            | { label: string; value: string; showCollapsed?: boolean }
            | (Component & { showCollapsed?: boolean })
          > = [];

          if (options.expanded) {
            details.projects.forEach((project, index) => {
              if (index > 0) fields.push(new Spacer(1));
              fields.push(renderProjectListItem(project, theme));
            });
          } else {
            const summaryLabel = `${details.projects.length} project${details.projects.length === 1 ? "" : "s"}`;
            const summaryText = new Text(
              theme.fg("accent", theme.bold(summaryLabel)),
              0,
              0,
            );
            Object.assign(summaryText, { showCollapsed: true });
            fields.push(summaryText);

            const collapsedSlice = details.projects.slice(0, COLLAPSED_MAX);
            for (const project of collapsedSlice) {
              const line = renderProjectOneLiner(project, theme);
              Object.assign(line, { showCollapsed: true });
              fields.push(line);
            }
            if (details.projects.length > COLLAPSED_MAX) {
              const more = new Text(
                theme.fg(
                  "dim",
                  `+ ${details.projects.length - COLLAPSED_MAX} more`,
                ),
                0,
                0,
              );
              Object.assign(more, { showCollapsed: true });
              fields.push(more);
            }
          }

          return new ToolBody(
            {
              fields,
              footer: options.expanded
                ? new ToolFooter(theme, {
                    items: [
                      {
                        value: `${details.projects.length} project${details.projects.length === 1 ? "" : "s"}`,
                        tone: "muted",
                      },
                    ],
                  })
                : undefined,
              includeSpacerBeforeFooter: fields.length > 0,
            },
            options,
            theme,
          );
        }

        if (details.project) {
          const project = details.project;
          const titleParts = [theme.fg("accent", theme.bold(project.name))];
          if (project.description) {
            titleParts.push(theme.fg("dim", project.description));
          }
          const titleText = new Text(titleParts.join(" - "), 0, 0);
          Object.assign(titleText, { showCollapsed: true });

          const fields: Array<
            | { label: string; value: string; showCollapsed?: boolean }
            | (Component & { showCollapsed?: boolean })
          > = [titleText];

          if (options.expanded) {
            for (const component of renderProjectExpanded(project, theme)) {
              fields.push(component);
            }
          }

          return new ToolBody(
            {
              fields,
              footer: new ToolFooter(theme, {
                items: [
                  { label: "Status", value: project.state, tone: "accent" },
                  {
                    label: "Priority",
                    value: project.priorityLabel,
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
