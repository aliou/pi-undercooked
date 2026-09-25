import type { ProjectMilestone, ProjectRelation } from "@linear/sdk";
import type {
  SerializedProjectMilestone,
  SerializedProjectRelation,
} from "./milestone-types";

export async function serializeProjectMilestone(
  milestone: ProjectMilestone,
): Promise<SerializedProjectMilestone> {
  const project = await milestone.project;

  return {
    id: milestone.id,
    name: milestone.name,
    description: milestone.description ?? undefined,
    targetDate: milestone.targetDate ?? undefined,
    projectId: project?.id ?? "",
    projectName: project?.name,
    progress: milestone.progress,
    sortOrder: milestone.sortOrder,
    status: milestone.status,
    createdAt: milestone.createdAt.toISOString(),
    updatedAt: milestone.updatedAt.toISOString(),
  };
}

export async function serializeProjectRelation(
  relation: ProjectRelation,
): Promise<SerializedProjectRelation> {
  const [project, relatedProject, projectMilestone, relatedProjectMilestone] =
    await Promise.all([
      relation.project,
      relation.relatedProject,
      relation.projectMilestone,
      relation.relatedProjectMilestone,
    ]);

  return {
    id: relation.id,
    type: relation.type,
    anchorType: relation.anchorType,
    relatedAnchorType: relation.relatedAnchorType,
    projectId: project?.id ?? "",
    relatedProjectId: relatedProject?.id ?? "",
    relatedProjectName: relatedProject?.name,
    projectMilestoneId: projectMilestone?.id,
    projectMilestoneName: projectMilestone?.name,
    relatedProjectMilestoneId: relatedProjectMilestone?.id,
    relatedProjectMilestoneName: relatedProjectMilestone?.name,
    createdAt: relation.createdAt.toISOString(),
    updatedAt: relation.updatedAt.toISOString(),
  };
}
