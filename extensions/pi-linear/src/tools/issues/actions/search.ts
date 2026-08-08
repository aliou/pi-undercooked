import type { LinearClient } from "@linear/sdk";
import { serializeIssue } from "../serialize";
import type { SerializedIssue } from "../types";

export interface SearchIssuesParams {
  query?: string;
  limit?: number;
  includeArchived?: boolean;
  stateId?: string;
  assigneeId?: string;
  projectId?: string;
  teamId?: string;
  teamKey?: string;
  labelId?: string;
}

export interface SearchIssuesResult {
  issues?: SerializedIssue[];
  totalCount?: number;
  error?: string;
}

function buildIssueFilter(
  params: SearchIssuesParams,
): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};

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

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export async function searchIssues(
  client: LinearClient,
  params: SearchIssuesParams,
): Promise<SearchIssuesResult> {
  if (!params.query) {
    return { error: "query is required to search issues." };
  }

  try {
    const results = await client.searchIssues(params.query, {
      first: params.limit ?? 10,
      includeArchived: params.includeArchived ?? false,
      filter: buildIssueFilter(params) as never,
      teamId: params.teamId,
    });

    const issues = await Promise.all(
      results.nodes.map(async (result) =>
        serializeIssue(await client.issue(result.id)),
      ),
    );

    return {
      issues,
      totalCount: results.totalCount,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
