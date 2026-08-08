import type { LinearClient } from "@linear/sdk";
import type { SerializedIssueRelation } from "../types";

export interface ListIssueRelationsParams {
  issueId: string;
  includeInverseRelations?: boolean;
}

export interface ListIssueRelationsResult {
  relations?: SerializedIssueRelation[];
  error?: string;
}

export async function listIssueRelations(
  client: LinearClient,
  params: ListIssueRelationsParams,
): Promise<ListIssueRelationsResult> {
  if (!params.issueId) {
    return { error: "issueId is required to list relations." };
  }

  try {
    const issue = await client.issue(params.issueId);
    const [relationsConnection, inverseRelationsConnection] = await Promise.all(
      [
        issue.relations(),
        params.includeInverseRelations ? issue.inverseRelations() : undefined,
      ],
    );

    const directRelations = await Promise.all(
      relationsConnection.nodes.map(async (relation) => {
        const relatedIssue = await relation.relatedIssue;
        return {
          id: relation.id,
          type: relation.type,
          relatedIssueId: relatedIssue?.id,
          relatedIssueIdentifier: relatedIssue?.identifier,
          relatedIssueTitle: relatedIssue?.title,
          createdAt: relation.createdAt.toISOString(),
          updatedAt: relation.updatedAt.toISOString(),
        };
      }),
    );

    const inverseRelations = inverseRelationsConnection
      ? await Promise.all(
          inverseRelationsConnection.nodes.map(async (relation) => {
            const sourceIssue = await relation.issue;
            return {
              id: relation.id,
              type: relation.type === "blocks" ? "blocked_by" : relation.type,
              relatedIssueId: sourceIssue?.id,
              relatedIssueIdentifier: sourceIssue?.identifier,
              relatedIssueTitle: sourceIssue?.title,
              createdAt: relation.createdAt.toISOString(),
              updatedAt: relation.updatedAt.toISOString(),
            };
          }),
        )
      : [];

    return { relations: [...directRelations, ...inverseRelations] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
