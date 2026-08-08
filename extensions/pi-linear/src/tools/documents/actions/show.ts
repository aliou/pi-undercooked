import type { LinearClient } from "@linear/sdk";
import { serializeLinearDocument } from "../serialize";
import type { SerializedLinearDocument } from "../types";

export interface ShowDocumentParams {
  id?: string;
}

export interface ShowDocumentResult {
  document?: SerializedLinearDocument;
  error?: string;
}

export async function showDocument(
  client: LinearClient,
  params: ShowDocumentParams,
): Promise<ShowDocumentResult> {
  if (!params.id) {
    return { error: "id is required to show a document." };
  }

  try {
    const document = await client.document(params.id);
    return { document: await serializeLinearDocument(document) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
