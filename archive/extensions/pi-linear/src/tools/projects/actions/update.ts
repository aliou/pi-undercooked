import type { LinearClient } from "@linear/sdk";
import { serializeProject } from "../serialize";
import type { SerializedProject } from "../types";

export interface UpdateProjectParams {
  id?: string;
  name?: string;
  description?: string;
  leadId?: string;
  priority?: number;
  statusId?: string;
  startDate?: string;
  targetDate?: string;
  content?: string;
  teamIds?: string[];
}

export interface UpdateProjectResult {
  project?: SerializedProject;
  error?: string;
}

export async function updateProject(
  client: LinearClient,
  params: UpdateProjectParams,
): Promise<UpdateProjectResult> {
  if (!params.id) {
    return { error: "id is required to update a project." };
  }

  try {
    const payload = await client.updateProject(params.id, {
      name: params.name,
      description: params.description,
      leadId: params.leadId,
      priority: params.priority,
      statusId: params.statusId,
      startDate: params.startDate,
      targetDate: params.targetDate,
      content: params.content,
      teamIds: params.teamIds,
    });

    const project = await payload.project;
    if (!project) {
      return { error: "Project updated but could not be fetched." };
    }

    return { project: await serializeProject(project) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
