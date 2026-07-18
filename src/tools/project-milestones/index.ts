import { ToolCallHeader } from "@aliou/pi-utils-ui";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { prepareToolText } from "../output";
import { createProjectMilestone } from "../projects/actions/milestone-create";
import { deleteProjectMilestone } from "../projects/actions/milestone-delete";
import { showProjectMilestone } from "../projects/actions/milestone-show";
import { updateProjectMilestone } from "../projects/actions/milestone-update";
import { listProjectMilestones } from "../projects/actions/milestones-list";
import type { SerializedProjectMilestone } from "../projects/milestone-types";

const ProjectMilestonesParams = Type.Object({
  action: StringEnum(["list", "show", "create", "update", "delete"], {
    description: "Project milestone action to perform.",
  }),
  projectId: Type.Optional(
    Type.String({
      description: "Project ID. Required for list and create.",
    }),
  ),
  milestoneId: Type.Optional(
    Type.String({
      description: "Milestone ID. Required for show, update, and delete.",
    }),
  ),
  name: Type.Optional(Type.String({ description: "Milestone name." })),
  description: Type.Optional(
    Type.String({ description: "Milestone description in markdown." }),
  ),
  targetDate: Type.Optional(
    Type.String({ description: "Target date (YYYY-MM-DD)." }),
  ),
  sortOrder: Type.Optional(
    Type.Number({ description: "Milestone sort order." }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum milestones to return for list." }),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({ description: "Include archived milestones in list." }),
  ),
});

type ProjectMilestonesParamsType = Static<typeof ProjectMilestonesParams>;

interface ProjectMilestonesDetails {
  action: string;
  milestone?: SerializedProjectMilestone;
  milestones?: SerializedProjectMilestone[];
  deleted?: boolean;
  error?: string;
}

export function registerProjectMilestonesTool(pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "linear_project_milestones",
      label: "Linear: Project Milestones",
      description: "Manage Linear project milestones.",
      promptSnippet:
        "Use linear_project_milestones to list, show, create, update, or delete milestones within a Linear project.",
      promptGuidelines: [
        "Supply projectId for linear_project_milestones list and create.",
        "Supply milestoneId for linear_project_milestones show, update, and delete.",
      ],
      parameters: ProjectMilestonesParams,
      executionMode: "sequential",
      async execute(
        _toolCallId,
        params,
        _signal,
        onUpdate,
        _ctx,
      ): Promise<AgentToolResult<ProjectMilestonesDetails>> {
        const client = getLinearClient();
        if (!client) {
          return {
            content: [{ type: "text", text: LINEAR_CREDENTIALS_ERROR }],
            details: { action: params.action, error: LINEAR_CREDENTIALS_ERROR },
          };
        }

        onUpdate?.({
          content: [
            {
              type: "text",
              text: `Running project_milestones.${params.action}...`,
            },
          ],
          details: { action: params.action },
        });

        let details: ProjectMilestonesDetails;
        let text = "";

        switch (params.action) {
          case "list": {
            const result = await listProjectMilestones(client, {
              id:
                typeof params.projectId === "string"
                  ? params.projectId
                  : undefined,
              limit:
                typeof params.limit === "number" ? params.limit : undefined,
              includeArchived:
                typeof params.includeArchived === "boolean"
                  ? params.includeArchived
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, milestones: result.milestones };
            text = result.milestones
              ? `Listed ${result.milestones.length} milestones.\n${result.milestones
                  .map(
                    (milestone) =>
                      `- ${milestone.name} | ${milestone.targetDate ?? "no target date"}`,
                  )
                  .join("\n")}`
              : "";
            break;
          }
          case "show": {
            const result = await showProjectMilestone(client, {
              milestoneId:
                typeof params.milestoneId === "string"
                  ? params.milestoneId
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, milestone: result.milestone };
            if (result.milestone) {
              text = JSON.stringify(
                {
                  id: result.milestone.id,
                  name: result.milestone.name,
                  status: result.milestone.status,
                  progress: Math.round(result.milestone.progress * 100),
                  targetDate: result.milestone.targetDate,
                  projectName: result.milestone.projectName,
                  description: result.milestone.description,
                },
                null,
                2,
              );
            }
            break;
          }
          case "create": {
            const result = await createProjectMilestone(client, {
              projectId:
                typeof params.projectId === "string"
                  ? params.projectId
                  : undefined,
              name: typeof params.name === "string" ? params.name : undefined,
              description:
                typeof params.description === "string"
                  ? params.description
                  : undefined,
              targetDate:
                typeof params.targetDate === "string"
                  ? params.targetDate
                  : undefined,
              sortOrder:
                typeof params.sortOrder === "number"
                  ? params.sortOrder
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, milestone: result.milestone };
            if (result.milestone) {
              text = JSON.stringify(
                {
                  id: result.milestone.id,
                  name: result.milestone.name,
                  status: result.milestone.status,
                  progress: Math.round(result.milestone.progress * 100),
                  targetDate: result.milestone.targetDate,
                  projectName: result.milestone.projectName,
                  description: result.milestone.description,
                },
                null,
                2,
              );
            }
            break;
          }
          case "update": {
            const result = await updateProjectMilestone(client, {
              milestoneId:
                typeof params.milestoneId === "string"
                  ? params.milestoneId
                  : undefined,
              projectId:
                typeof params.projectId === "string"
                  ? params.projectId
                  : undefined,
              name: typeof params.name === "string" ? params.name : undefined,
              description:
                typeof params.description === "string"
                  ? params.description
                  : undefined,
              targetDate:
                typeof params.targetDate === "string"
                  ? params.targetDate
                  : undefined,
              sortOrder:
                typeof params.sortOrder === "number"
                  ? params.sortOrder
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, milestone: result.milestone };
            if (result.milestone) {
              text = JSON.stringify(
                {
                  id: result.milestone.id,
                  name: result.milestone.name,
                  status: result.milestone.status,
                  progress: Math.round(result.milestone.progress * 100),
                  targetDate: result.milestone.targetDate,
                  projectName: result.milestone.projectName,
                  description: result.milestone.description,
                },
                null,
                2,
              );
            }
            break;
          }
          case "delete": {
            const result = await deleteProjectMilestone(client, {
              milestoneId:
                typeof params.milestoneId === "string"
                  ? params.milestoneId
                  : undefined,
            });
            details = result.error
              ? { action: params.action, error: result.error }
              : { action: params.action, deleted: result.deleted };
            if (result.deleted)
              text = `Deleted milestone ${String(params.milestoneId ?? "")}.`;
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
              text: await prepareToolText(
                text || "Done.",
                "linear_project_milestones",
              ),
            },
          ],
          details,
        };
      },
      renderCall(args: ProjectMilestonesParamsType, theme: Theme) {
        return new ToolCallHeader(
          {
            toolName: "Linear Project Milestones",
            action: args.action,
            mainArg: args.name ?? args.milestoneId ?? args.projectId,
          },
          theme,
        );
      },
      renderResult(
        result: AgentToolResult<ProjectMilestonesDetails>,
        options: ToolRenderResultOptions,
        theme: Theme,
      ) {
        if (options.isPartial) {
          return new Text(
            theme.fg("muted", "Linear project milestones running..."),
            0,
            0,
          );
        }
        if (result.details?.error) {
          return new Text(theme.fg("error", result.details.error), 0, 0);
        }
        const text = result.content[0];
        return new Text(
          text?.type === "text" && text.text ? text.text : "Done.",
          0,
          0,
        );
      },
    }),
  );
}
