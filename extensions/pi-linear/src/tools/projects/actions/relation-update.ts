import type { LinearClient } from "@linear/sdk";
import { serializeProjectRelation } from "../milestone-serialize";
import type { SerializedProjectRelation } from "../milestone-types";

export interface UpdateProjectRelationParams {
  relationId?: string;
  projectId?: string;
  relatedProjectId?: string;
  type?: string;
  anchorType?: string;
  relatedAnchorType?: string;
  projectMilestoneId?: string;
  relatedProjectMilestoneId?: string;
}

export interface UpdateProjectRelationResult {
  relation?: SerializedProjectRelation;
  error?: string;
}

export async function updateProjectRelation(
  client: LinearClient,
  params: UpdateProjectRelationParams,
): Promise<UpdateProjectRelationResult> {
  if (!params.relationId) {
    return { error: "relationId is required to update a project relation." };
  }

  try {
    const payload = await client.updateProjectRelation(params.relationId, {
      projectId: params.projectId,
      relatedProjectId: params.relatedProjectId,
      type: params.type,
      anchorType: params.anchorType,
      relatedAnchorType: params.relatedAnchorType,
      projectMilestoneId: params.projectMilestoneId,
      relatedProjectMilestoneId: params.relatedProjectMilestoneId,
    });

    const relation = await payload.projectRelation;
    if (!relation) {
      return { error: "Project relation updated but could not be fetched." };
    }

    return { relation: await serializeProjectRelation(relation) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
