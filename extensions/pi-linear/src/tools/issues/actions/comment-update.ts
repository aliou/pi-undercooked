import type { LinearClient } from "@linear/sdk";
import type { SerializedComment } from "../types";

export interface UpdateIssueCommentParams {
  id: string;
  body: string;
}

export interface UpdateIssueCommentResult {
  comment?: SerializedComment;
  error?: string;
}

export async function updateIssueComment(
  client: LinearClient,
  params: UpdateIssueCommentParams,
): Promise<UpdateIssueCommentResult> {
  if (!params.id) {
    return { error: "id is required to update a comment." };
  }

  if (!params.body) {
    return { error: "body is required to update a comment." };
  }

  try {
    const payload = await client.updateComment(params.id, {
      body: params.body,
    });

    const comment = await payload.comment;
    if (!comment) {
      return { error: "Comment updated but could not be fetched." };
    }

    const user = await comment.user;

    return {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
        userId: user?.id,
        userName: user?.displayName,
        reactionCount: comment.reactions.length,
        url: comment.url,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
