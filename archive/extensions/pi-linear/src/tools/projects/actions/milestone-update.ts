import type { LinearClient } from "@linear/sdk";
import { serializeProjectMilestone } from "../milestone-serialize";
import type { SerializedProjectMilestone } from "../milestone-types";

export interface UpdateProjectMilestoneParams {
  milestoneId?: string;
  projectId?: string;
  name?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: number;
}

export interface UpdateProjectMilestoneResult {
  milestone?: SerializedProjectMilestone;
  error?: string;
}

export async function updateProjectMilestone(
  client: LinearClient,
  params: UpdateProjectMilestoneParams,
): Promise<UpdateProjectMilestoneResult> {
  if (!params.milestoneId) {
    return { error: "milestoneId is required to update a milestone." };
  }

  try {
    const payload = await client.updateProjectMilestone(params.milestoneId, {
      projectId: params.projectId,
      name: params.name,
      description: params.description,
      targetDate: params.targetDate,
      sortOrder: params.sortOrder,
    });

    const milestone = await payload.projectMilestone;
    if (!milestone) {
      return { error: "Milestone updated but could not be fetched." };
    }

    return { milestone: await serializeProjectMilestone(milestone) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
