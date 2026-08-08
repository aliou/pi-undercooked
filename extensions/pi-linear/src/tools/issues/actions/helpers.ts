import type { LinearClient } from "@linear/sdk";

export async function resolveIssueProjectMilestoneId(
  _client: LinearClient,
  options: {
    projectId?: string;
    projectMilestoneId?: string;
  },
): Promise<{ milestoneId?: string; error?: string }> {
  if (options.projectMilestoneId) {
    return { milestoneId: options.projectMilestoneId };
  }

  return {};
}
