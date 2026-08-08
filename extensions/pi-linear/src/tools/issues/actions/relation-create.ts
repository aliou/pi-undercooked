import type { LinearClient } from "@linear/sdk";
import type { SerializedIssueRelation } from "../types";
import { normalizeIssueRelationType } from "./relation-shared";

export interface CreateIssueRelationParams {
  issueId: string;
  relatedIssueId: string;
  type: string;
}

export interface CreateIssueRelationResult {
  relation?: SerializedIssueRelation;
  error?: string;
}

export async function createIssueRelation(
  client: LinearClient,
  params: CreateIssueRelationParams,
): Promise<CreateIssueRelationResult> {
  if (!params.issueId) {
    return { error: "issueId is required to create a relation." };
  }
  if (!params.relatedIssueId) {
    return { error: "relatedIssueId is required to create a relation." };
  }
  if (!params.type) {
    return { error: "type is required to create a relation." };
  }

  const normalized = normalizeIssueRelationType(params.type);
  if (!normalized.type) {
    return {
      error:
        "Unsupported relation type. Use blocks, blocked_by, duplicate, related, or similar.",
    };
  }

  try {
    const payload = await client.createIssueRelation({
      issueId: normalized.reverse ? params.relatedIssueId : params.issueId,
      relatedIssueId: normalized.reverse
        ? params.issueId
        : params.relatedIssueId,
      type: normalized.type as Parameters<
        LinearClient["createIssueRelation"]
      >[0]["type"],
    });

    const relation = await payload.issueRelation;
    if (!relation) {
      return { error: "Relation created but could not be fetched." };
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
