import type { LinearClient } from "@linear/sdk";
import { serializeProjectRelation } from "../milestone-serialize";
import type { SerializedProjectRelation } from "../milestone-types";

export interface CreateProjectRelationParams {
  projectId?: string;
  relatedProjectId?: string;
  type?: string;
  anchorType?: string;
  relatedAnchorType?: string;
  projectMilestoneId?: string;
  relatedProjectMilestoneId?: string;
}

export interface CreateProjectRelationResult {
  relation?: SerializedProjectRelation;
  error?: string;
}

export async function createProjectRelation(
  client: LinearClient,
  params: CreateProjectRelationParams,
): Promise<CreateProjectRelationResult> {
  if (!params.projectId || !params.relatedProjectId || !params.type) {
    return {
      error:
        "projectId, relatedProjectId, and type are required to create a project relation.",
    };
  }

  try {
    const payload = await client.createProjectRelation({
      projectId: params.projectId,
      relatedProjectId: params.relatedProjectId,
      type: params.type,
      anchorType: params.anchorType ?? "project",
      relatedAnchorType: params.relatedAnchorType ?? "project",
      projectMilestoneId: params.projectMilestoneId,
      relatedProjectMilestoneId: params.relatedProjectMilestoneId,
    });

    const relation = await payload.projectRelation;
    if (!relation) {
      return { error: "Project relation created but could not be fetched." };
    }

    return { relation: await serializeProjectRelation(relation) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
