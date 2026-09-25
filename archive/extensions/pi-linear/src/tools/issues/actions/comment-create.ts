import type { LinearClient } from "@linear/sdk";
import type { SerializedComment } from "../types";

export interface CreateIssueCommentParams {
  issueId: string;
  body: string;
}

export interface CreateIssueCommentResult {
  comment?: SerializedComment;
  error?: string;
}

export async function createIssueComment(
  client: LinearClient,
  params: CreateIssueCommentParams,
): Promise<CreateIssueCommentResult> {
  if (!params.issueId) {
    return { error: "issueId is required to create a comment." };
  }

  if (!params.body) {
    return { error: "body is required to create a comment." };
  }

  try {
    const payload = await client.createComment({
      issueId: params.issueId,
      body: params.body,
    });

    const comment = await payload.comment;
    if (!comment) {
      return { error: "Comment created but could not be fetched." };
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
