import type { LinearClient } from "@linear/sdk";
import { serializeProject } from "../serialize";
import type { SerializedProject } from "../types";

export interface ListProjectsParams {
  limit?: number;
  includeArchived?: boolean;
  statusId?: string;
  leadId?: string;
  teamId?: string;
  teamKey?: string;
}

export interface ListProjectsResult {
  projects?: SerializedProject[];
  error?: string;
}

function buildProjectFilter(
  params: ListProjectsParams,
): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};

  if (params.statusId) {
    filter.status = { id: { eq: params.statusId } };
  }

  if (params.leadId) {
    filter.lead = { id: { eq: params.leadId } };
  }

  if (params.teamId || params.teamKey) {
    filter.accessibleTeams = params.teamId
      ? { some: { id: { eq: params.teamId } } }
      : { some: { key: { eq: params.teamKey } } };
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export async function listProjects(
  client: LinearClient,
  params: ListProjectsParams,
): Promise<ListProjectsResult> {
  try {
    const projects = await client.projects({
      first: params.limit ?? 10,
      includeArchived: params.includeArchived ?? false,
      filter: buildProjectFilter(params) as never,
    });

    return {
      projects: await Promise.all(
        projects.nodes.map((project) => serializeProject(project)),
      ),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
