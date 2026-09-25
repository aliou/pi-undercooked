import type { LinearClient } from "@linear/sdk";
import { serializeProjectMilestone } from "../milestone-serialize";
import type { SerializedProjectMilestone } from "../milestone-types";

export interface ListProjectMilestonesParams {
  id?: string;
  limit?: number;
  includeArchived?: boolean;
}

export interface ListProjectMilestonesResult {
  milestones?: SerializedProjectMilestone[];
  error?: string;
}

export async function listProjectMilestones(
  client: LinearClient,
  params: ListProjectMilestonesParams,
): Promise<ListProjectMilestonesResult> {
  if (!params.id) {
    return { error: "id is required to list project milestones." };
  }

  try {
    const project = await client.project(params.id);
    const milestones = await project.projectMilestones({
      first: params.limit ?? 50,
      includeArchived: params.includeArchived ?? false,
    });

    return {
      milestones: await Promise.all(
        milestones.nodes.map((milestone) =>
          serializeProjectMilestone(milestone),
        ),
      ),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
