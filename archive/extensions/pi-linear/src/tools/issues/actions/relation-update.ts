import type { LinearClient } from "@linear/sdk";
import type { SerializedIssueRelation } from "../types";
import { normalizeIssueRelationType } from "./relation-shared";

export interface UpdateIssueRelationParams {
  id: string;
  type?: string;
}

export interface UpdateIssueRelationResult {
  relation?: SerializedIssueRelation;
  error?: string;
}

export async function updateIssueRelation(
  client: LinearClient,
  params: UpdateIssueRelationParams,
): Promise<UpdateIssueRelationResult> {
  if (!params.id) {
    return { error: "id is required to update a relation." };
  }

  const normalized = params.type
    ? normalizeIssueRelationType(params.type)
    : { type: undefined, reverse: false };
  if (params.type && !normalized.type) {
    return {
      error:
        "Unsupported relation type. Use blocks, blocked_by, duplicate, related, or similar.",
    };
  }

  try {
    const payload = await client.updateIssueRelation(params.id, {
      type: normalized.type,
    });

    const relation = await payload.issueRelation;
    if (!relation) {
      return { error: "Relation updated but could not be fetched." };
    }

    const relatedIssue = await relation.relatedIssue;

    return {
      relation: {
        id: relation.id,
        type: normalized.reverse ? "blocked_by" : relation.type,
        relatedIssueId: relatedIssue?.id,
        relatedIssueIdentifier: relatedIssue?.identifier,
        relatedIssueTitle: relatedIssue?.title,
        createdAt: relation.createdAt.toISOString(),
        updatedAt: relation.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
