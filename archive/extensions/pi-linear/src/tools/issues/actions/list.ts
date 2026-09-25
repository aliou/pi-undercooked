import type { LinearClient } from "@linear/sdk";
import { serializeIssue } from "../serialize";
import type { SerializedIssue } from "../types";

export interface ListIssuesParams {
  limit?: number;
  includeArchived?: boolean;
  stateId?: string;
  assigneeId?: string;
  projectId?: string;
  teamId?: string;
  teamKey?: string;
  labelId?: string;
  includeCompleted?: boolean;
  includeCanceled?: boolean;
  includeSubIssues?: boolean;
}

export interface ListIssuesResult {
  issues?: SerializedIssue[];
  error?: string;
}

function buildIssueFilter(params: ListIssuesParams): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  const excludeTypes: string[] = [];
  if (!params.includeCompleted) excludeTypes.push("completed");
  if (!params.includeCanceled) excludeTypes.push("canceled", "duplicate");
  if (excludeTypes.length > 0) {
    filter.state = { type: { nin: excludeTypes } };
  }

  if (params.stateId) {
    filter.state = { id: { eq: params.stateId } };
  }

  if (params.assigneeId) {
    filter.assignee = { id: { eq: params.assigneeId } };
  }

  if (params.projectId) {
    filter.project = { id: { eq: params.projectId } };
  }

  if (params.teamId || params.teamKey) {
    filter.team = params.teamId
      ? { id: { eq: params.teamId } }
      : { key: { eq: params.teamKey } };
  }

  if (params.labelId) {
    filter.labels = { some: { id: { eq: params.labelId } } };
  }

  return filter;
}

export async function listIssues(
  client: LinearClient,
  params: ListIssuesParams,
): Promise<ListIssuesResult> {
  try {
    const filter = buildIssueFilter(params);

    const issues = await client.issues({
      first: params.limit ?? 10,
      includeArchived: params.includeArchived ?? false,
      filter: Object.keys(filter).length > 0 ? (filter as never) : undefined,
    });

    const serialized = await Promise.all(
      issues.nodes.map((issue) => serializeIssue(issue)),
    );

    return {
      issues:
        params.includeSubIssues === false
          ? serialized.filter((issue) => !issue.parentId)
          : serialized,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
