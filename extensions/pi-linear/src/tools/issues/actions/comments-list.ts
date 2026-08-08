import type { LinearClient } from "@linear/sdk";
import type { SerializedComment } from "../types";

export interface ListIssueCommentsParams {
  issueId: string;
}

export interface ListIssueCommentsResult {
  comments?: SerializedComment[];
  error?: string;
}

export async function listIssueComments(
  client: LinearClient,
  params: ListIssueCommentsParams,
): Promise<ListIssueCommentsResult> {
  if (!params.issueId) {
    return { error: "issueId is required to list comments." };
  }

  try {
    const issue = await client.issue(params.issueId);
    const commentsConnection = await issue.comments();

    const comments = await Promise.all(
      commentsConnection.nodes.map(async (comment) => {
        const user = await comment.user;

        return {
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
          userId: user?.id,
          userName: user?.displayName,
          reactionCount: comment.reactions.length,
          url: comment.url,
        };
      }),
    );

    return { comments };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
