import type { LinearClient } from "@linear/sdk";

export interface DeleteProjectMilestoneParams {
  milestoneId?: string;
}

export interface DeleteProjectMilestoneResult {
  deleted?: boolean;
  error?: string;
}

export async function deleteProjectMilestone(
  client: LinearClient,
  params: DeleteProjectMilestoneParams,
): Promise<DeleteProjectMilestoneResult> {
  if (!params.milestoneId) {
    return { error: "milestoneId is required to delete a milestone." };
  }

  try {
    await client.deleteProjectMilestone(params.milestoneId);
    return { deleted: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
