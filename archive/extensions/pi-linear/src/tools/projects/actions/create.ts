import type { LinearClient } from "@linear/sdk";
import { serializeProject } from "../serialize";
import type { SerializedProject } from "../types";

export interface CreateProjectParams {
  name?: string;
  teamIds?: string[];
  description?: string;
  leadId?: string;
  priority?: number;
  statusId?: string;
  startDate?: string;
  targetDate?: string;
  content?: string;
}

export interface CreateProjectResult {
  project?: SerializedProject;
  error?: string;
}

export async function createProject(
  client: LinearClient,
  params: CreateProjectParams,
): Promise<CreateProjectResult> {
  if (!params.name) {
    return { error: "name is required to create a project." };
  }

  if (!params.teamIds || params.teamIds.length === 0) {
    return {
      error: "teamIds is required to create a project (at least one team ID).",
    };
  }

  try {
    const payload = await client.createProject({
      name: params.name,
      teamIds: params.teamIds,
      description: params.description,
      leadId: params.leadId,
      priority: params.priority,
      statusId: params.statusId,
      startDate: params.startDate,
      targetDate: params.targetDate,
      content: params.content,
    });

    const project = await payload.project;
    if (!project) {
      return { error: "Project created but could not be fetched." };
    }

    return { project: await serializeProject(project) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
