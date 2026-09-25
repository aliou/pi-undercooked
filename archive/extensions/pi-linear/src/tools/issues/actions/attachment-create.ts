import type { LinearClient } from "@linear/sdk";
import type { SerializedAttachment } from "../types";

export interface CreateIssueAttachmentParams {
  issueId: string;
  url: string;
  title?: string;
}

export interface CreateIssueAttachmentResult {
  attachment?: SerializedAttachment;
  error?: string;
}

export async function createIssueAttachment(
  client: LinearClient,
  params: CreateIssueAttachmentParams,
): Promise<CreateIssueAttachmentResult> {
  if (!params.issueId) {
    return { error: "issueId is required to create an attachment." };
  }

  if (!params.url) {
    return { error: "url is required to create an attachment." };
  }

  try {
    const payload = await client.attachmentLinkURL(params.issueId, params.url, {
      title: params.title,
    });

    const attachment = await payload.attachment;
    if (!attachment) {
      return { error: "Attachment created but could not be fetched." };
    }

    const user = await attachment.creator;

    return {
      attachment: {
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
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
