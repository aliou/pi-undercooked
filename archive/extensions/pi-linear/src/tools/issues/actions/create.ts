import type { LinearClient } from "@linear/sdk";
import { resolveTeamId } from "../../../teams";
import { resolveProjectId } from "../../projects/lookup";
import { serializeIssue } from "../serialize";
import type { SerializedIssue } from "../types";
import { resolveIssueProjectMilestoneId } from "./helpers";

export interface CreateIssueParams {
  teamId?: string;
  teamKey?: string;
  title?: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  stateId?: string;
  projectId?: string;
  projectMilestoneId?: string;
  labelIds?: string[];
  dueDate?: string;
  estimate?: number;
  parentId?: string;
}

export interface CreateIssueResult {
  issue?: SerializedIssue;
  error?: string;
}

export async function createIssue(
  client: LinearClient,
  params: CreateIssueParams,
): Promise<CreateIssueResult> {
  if (!params.title) {
    return { error: "title is required to create an issue." };
  }

  try {
    const teamId = await resolveTeamId(
      client,
      params.teamId,
      params.teamKey,
      undefined,
    );
    if (!teamId) {
      const identifier = params.teamKey ?? params.teamId;
      return {
        error: identifier
          ? `Could not find team "${identifier}". Verify the team key or name.`
          : "No team resolved. Provide teamId/teamKey or set defaultTeamKey in /linear:auth or /linear:settings.",
      };
    }

    const resolvedProjectId = await resolveProjectId(client, params.projectId);
    const { milestoneId, error } = await resolveIssueProjectMilestoneId(
      client,
      {
        projectId: resolvedProjectId,
        projectMilestoneId: params.projectMilestoneId,
      },
    );
    if (error) return { error };

    const payload = await client.createIssue({
      teamId,
      title: params.title,
      description: params.description,
      assigneeId: params.assigneeId,
      priority: params.priority,
      stateId: params.stateId,
      projectId: resolvedProjectId,
      projectMilestoneId: milestoneId,
      labelIds: params.labelIds,
      dueDate: params.dueDate,
      estimate: params.estimate,
      parentId: params.parentId,
    });

    const issue = await payload.issue;
    if (!issue) {
      return { error: "Issue created but could not be fetched." };
    }

    return { issue: await serializeIssue(issue) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
