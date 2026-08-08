import type { LinearClient } from "@linear/sdk";
import type { SerializedDocument } from "../types";

export interface ListIssueDocumentsParams {
  issueId: string;
}

export interface ListIssueDocumentsResult {
  documents?: SerializedDocument[];
  error?: string;
}

export async function listIssueDocuments(
  client: LinearClient,
  params: ListIssueDocumentsParams,
): Promise<ListIssueDocumentsResult> {
  if (!params.issueId) {
    return { error: "issueId is required to list documents." };
  }

  try {
    const issue = await client.issue(params.issueId);
    const documentsConnection = await issue.documents();

    const documents = await Promise.all(
      documentsConnection.nodes.map(async (document) => {
        const [creator, linkedIssue, linkedProject] = await Promise.all([
          document.creator,
          document.issue,
          document.project,
        ]);

        return {
          id: document.id,
          title: document.title,
          url: document.url,
          createdAt: document.createdAt.toISOString(),
          updatedAt: document.updatedAt.toISOString(),
          creatorId: creator?.id,
          creatorName: creator?.displayName,
          issueId: linkedIssue?.id,
          projectId: linkedProject?.id,
        };
      }),
    );

    return { documents };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
