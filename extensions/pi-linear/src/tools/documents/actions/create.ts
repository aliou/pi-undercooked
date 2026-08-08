import type { LinearClient } from "@linear/sdk";
import { serializeLinearDocument } from "../serialize";
import type { SerializedLinearDocument } from "../types";

export interface CreateDocumentParams {
  title?: string;
  content?: string;
  issueId?: string;
  projectId?: string;
}

export interface CreateDocumentResult {
  document?: SerializedLinearDocument;
  error?: string;
}

export async function createDocument(
  client: LinearClient,
  params: CreateDocumentParams,
): Promise<CreateDocumentResult> {
  if (!params.title) {
    return { error: "title is required to create a document." };
  }

  try {
    const payload = await client.createDocument({
      title: params.title,
      content: params.content,
      issueId: params.issueId,
      projectId: params.projectId,
    });
    const document = await payload.document;
    if (!document)
      return { error: "Document created but could not be fetched." };
    return { document: await serializeLinearDocument(document) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
