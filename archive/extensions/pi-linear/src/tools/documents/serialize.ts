import type { Document } from "@linear/sdk";
import type { SerializedLinearDocument } from "./types";

export async function serializeLinearDocument(
  document: Document,
): Promise<SerializedLinearDocument> {
  const [creator, issue, project] = await Promise.all([
    document.creator,
    document.issue,
    document.project,
  ]);

  return {
    id: document.id,
    title: document.title,
    content: document.content ?? undefined,
    url: document.url,
    slugId: document.slugId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    creator: creator?.displayName,
    issueId: issue?.id,
    projectId: project?.id,
  };
}
