import type { LinearClient } from "@linear/sdk";
import type { SerializedAttachment } from "../types";

export interface ListIssueAttachmentsParams {
  issueId: string;
}

export interface ListIssueAttachmentsResult {
  attachments?: SerializedAttachment[];
  error?: string;
}

export async function listIssueAttachments(
  client: LinearClient,
  params: ListIssueAttachmentsParams,
): Promise<ListIssueAttachmentsResult> {
  if (!params.issueId) {
    return { error: "issueId is required to list attachments." };
  }

  try {
    const issue = await client.issue(params.issueId);
    const attachmentsConnection = await issue.attachments();

    const attachments = await Promise.all(
      attachmentsConnection.nodes.map(async (attachment) => {
        const user = await attachment.creator;

        return {
          id: attachment.id,
          title: attachment.title,
          subtitle: attachment.subtitle ?? undefined,
          sourceType: attachment.sourceType ?? undefined,
          url: attachment.url,
          createdAt: attachment.createdAt.toISOString(),
          updatedAt: attachment.updatedAt.toISOString(),
          creatorId: user?.id,
          creatorName: user?.displayName,
          metadata: attachment.metadata as Record<
            string,
            string | number | boolean | null
          >,
        };
      }),
    );

    return { attachments };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
