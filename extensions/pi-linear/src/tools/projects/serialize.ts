import type { Project } from "@linear/sdk";
import type { SerializedProject } from "./types";

/** Resolve lazy SDK refs on a Project into a plain object. */
export async function serializeProject(
  project: Project,
): Promise<SerializedProject> {
  const [lead, teams, status, issues, externalLinks, documents] =
    await Promise.all([
      project.lead,
      project.teams(),
      project.status,
      project.issues(),
      project.externalLinks(),
      project.documents(),
    ]);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    state: status?.name ?? project.state,
    icon: project.icon ?? undefined,
    color: project.color,
    progress: project.progress,
    priority: project.priority,
    priorityLabel: project.priorityLabel,
    url: project.url,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    startDate: project.startDate ?? undefined,
    targetDate: project.targetDate ?? undefined,
    lead: lead?.displayName,
    teams: teams.nodes.map((t) => t.name),
    content: project.content ?? undefined,
    issueCount: issues.nodes.length,
    links: externalLinks.nodes.map((l) => ({ label: l.label, url: l.url })),
    documents: documents.nodes.map((d) => ({
      title: d.title,
      url: `https://linear.app/document/${d.slugId}`,
    })),
  };
}
