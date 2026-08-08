import type { LinearClient } from "@linear/sdk";

export interface DeleteProjectRelationParams {
  relationId?: string;
}

export interface DeleteProjectRelationResult {
  deleted?: boolean;
  error?: string;
}

export async function deleteProjectRelation(
  client: LinearClient,
  params: DeleteProjectRelationParams,
): Promise<DeleteProjectRelationResult> {
  if (!params.relationId) {
    return { error: "relationId is required to delete a project relation." };
  }

  try {
    await client.deleteProjectRelation(params.relationId);
    return { deleted: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
