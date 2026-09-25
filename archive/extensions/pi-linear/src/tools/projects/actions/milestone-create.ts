import type { LinearClient } from "@linear/sdk";
import { serializeProjectMilestone } from "../milestone-serialize";
import type { SerializedProjectMilestone } from "../milestone-types";

export interface CreateProjectMilestoneParams {
  projectId?: string;
  name?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: number;
}

export interface CreateProjectMilestoneResult {
  milestone?: SerializedProjectMilestone;
  error?: string;
}

export async function createProjectMilestone(
  client: LinearClient,
  params: CreateProjectMilestoneParams,
): Promise<CreateProjectMilestoneResult> {
  if (!params.projectId) {
    return { error: "projectId is required to create a milestone." };
  }
  if (!params.name) {
    return { error: "name is required to create a milestone." };
  }

  try {
    const payload = await client.createProjectMilestone({
      projectId: params.projectId,
      name: params.name,
      description: params.description,
      targetDate: params.targetDate,
      sortOrder: params.sortOrder,
    });

    const milestone = await payload.projectMilestone;
    if (!milestone) {
      return { error: "Milestone created but could not be fetched." };
    }

    return { milestone: await serializeProjectMilestone(milestone) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
