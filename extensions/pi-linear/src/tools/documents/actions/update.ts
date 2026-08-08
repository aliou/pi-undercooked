import type { LinearClient } from "@linear/sdk";
import { serializeLinearDocument } from "../serialize";
import type { SerializedLinearDocument } from "../types";

export interface UpdateDocumentParams {
  id?: string;
  title?: string;
  content?: string;
  issueId?: string;
  projectId?: string;
}

export interface UpdateDocumentResult {
  document?: SerializedLinearDocument;
  error?: string;
}

export async function updateDocument(
  client: LinearClient,
  params: UpdateDocumentParams,
): Promise<UpdateDocumentResult> {
  if (!params.id) {
    return { error: "id is required to update a document." };
  }

  try {
    const payload = await client.updateDocument(params.id, {
      title: params.title,
      content: params.content,
      issueId: params.issueId,
      projectId: params.projectId,
    });
    const document = await payload.document;
    if (!document)
      return { error: "Document updated but could not be fetched." };
    return { document: await serializeLinearDocument(document) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
