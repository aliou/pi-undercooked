import type { Issue } from "@linear/sdk";
import type { SerializedIssue } from "./types";

/** Resolve lazy SDK refs on an Issue into a plain object. */
export async function serializeIssue(issue: Issue): Promise<SerializedIssue> {
  const [state, assignee, delegate, project, team, labels, milestone] =
    await Promise.all([
      issue.state,
      issue.assignee,
      issue.delegate,
      issue.project,
      issue.team,
      issue.labels(),
      issue.projectMilestone,
    ]);

  const assigneeDisplay = delegate?.displayName
    ? assignee?.displayName
      ? `${delegate.displayName} (via ${assignee.displayName})`
      : delegate.displayName
    : assignee?.displayName;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? undefined,
    state: state?.name ?? "Unknown",
    assignee: assigneeDisplay,
    delegate: delegate?.displayName,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    url: issue.url,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    dueDate: issue.dueDate ?? undefined,
    estimate: issue.estimate ?? undefined,
    labels: labels.nodes.map((label) => label.name),
    project: project?.name,
    team: team?.name ?? "Unknown",
    parentId: issue.parentId ?? undefined,
    milestone: milestone?.name,
    branchName: issue.branchName ?? undefined,
  };
}
