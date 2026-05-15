import type { LinearClient, Project, ProjectMilestone } from "@linear/sdk";

export async function resolveProject(
  client: LinearClient,
  projectId?: string,
): Promise<Project | undefined> {
  if (!projectId) return undefined;
  return client.project(projectId);
}

export async function resolveProjectId(
  client: LinearClient,
  projectId?: string,
): Promise<string | undefined> {
  const project = await resolveProject(client, projectId);
  return project?.id;
}

export async function resolveProjectMilestone(
  client: LinearClient,
  options: {
    milestoneId?: string;
  },
): Promise<ProjectMilestone | undefined> {
  if (!options.milestoneId) return undefined;
  return client.projectMilestone(options.milestoneId);
}

export async function resolveProjectMilestoneId(
  client: LinearClient,
  options: {
    milestoneId?: string;
  },
): Promise<string | undefined> {
  const milestone = await resolveProjectMilestone(client, options);
  return milestone?.id;
}
