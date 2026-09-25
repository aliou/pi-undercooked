import type { LinearClient } from "@linear/sdk";

export interface DeleteDocumentParams {
  id?: string;
}

export interface DeleteDocumentResult {
  deleted?: boolean;
  error?: string;
}

export async function deleteDocument(
  client: LinearClient,
  params: DeleteDocumentParams,
): Promise<DeleteDocumentResult> {
  if (!params.id) {
    return { error: "id is required to delete a document." };
  }

  try {
    await client.deleteDocument(params.id);
    return { deleted: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
