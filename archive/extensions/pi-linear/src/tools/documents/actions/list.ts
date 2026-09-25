import type { LinearClient } from "@linear/sdk";
import { serializeLinearDocument } from "../serialize";
import type { SerializedLinearDocument } from "../types";

export interface ListDocumentsParams {
  limit?: number;
  issueId?: string;
  projectId?: string;
}

export interface ListDocumentsResult {
  documents?: SerializedLinearDocument[];
  error?: string;
}

export async function listDocuments(
  client: LinearClient,
  params: ListDocumentsParams,
): Promise<ListDocumentsResult> {
  try {
    const filter: Record<string, unknown> = {};
    if (params.issueId) filter.issue = { id: { eq: params.issueId } };
    if (params.projectId) filter.project = { id: { eq: params.projectId } };

    const documents = await client.documents({
      first: params.limit ?? 25,
      filter: Object.keys(filter).length > 0 ? (filter as never) : undefined,
    });

    return {
      documents: await Promise.all(
        documents.nodes.map((document) => serializeLinearDocument(document)),
      ),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
