import type { LinearClient } from "@linear/sdk";
import { serializeProjectMilestone } from "../milestone-serialize";
import type { SerializedProjectMilestone } from "../milestone-types";

export interface ShowProjectMilestoneParams {
  milestoneId?: string;
}

export interface ShowProjectMilestoneResult {
  milestone?: SerializedProjectMilestone;
  error?: string;
}

export async function showProjectMilestone(
  client: LinearClient,
  params: ShowProjectMilestoneParams,
): Promise<ShowProjectMilestoneResult> {
  if (!params.milestoneId) {
    return { error: "milestoneId is required to show a project milestone." };
  }

  try {
    const milestone = await client.projectMilestone(params.milestoneId);
    return { milestone: await serializeProjectMilestone(milestone) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
