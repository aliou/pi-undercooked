import type { LinearClient } from "@linear/sdk";
import { serializeProject } from "../serialize";
import type { SerializedProject } from "../types";

export interface ShowProjectParams {
  id?: string;
}

export interface ShowProjectResult {
  project?: SerializedProject;
  error?: string;
}

export async function showProject(
  client: LinearClient,
  params: ShowProjectParams,
): Promise<ShowProjectResult> {
  if (!params.id) {
    return { error: "id is required to show a project." };
  }

  try {
    const project = await client.project(params.id);
    return { project: await serializeProject(project) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
