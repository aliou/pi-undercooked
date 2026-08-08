import type { LinearClient } from "@linear/sdk";

export interface DeleteIssueCommentParams {
  id: string;
}

export interface DeleteIssueCommentResult {
  deleted?: boolean;
  error?: string;
}

export async function deleteIssueComment(
  client: LinearClient,
  params: DeleteIssueCommentParams,
): Promise<DeleteIssueCommentResult> {
  if (!params.id) {
    return { error: "id is required to delete a comment." };
  }

  try {
    await client.deleteComment(params.id);
    return { deleted: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
