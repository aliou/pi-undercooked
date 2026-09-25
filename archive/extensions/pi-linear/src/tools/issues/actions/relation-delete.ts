import type { LinearClient } from "@linear/sdk";

export interface DeleteIssueRelationParams {
  id: string;
}

export interface DeleteIssueRelationResult {
  deleted?: boolean;
  error?: string;
}

export async function deleteIssueRelation(
  client: LinearClient,
  params: DeleteIssueRelationParams,
): Promise<DeleteIssueRelationResult> {
  if (!params.id) {
    return { error: "id is required to delete a relation." };
  }

  try {
    await client.deleteIssueRelation(params.id);
    return { deleted: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
