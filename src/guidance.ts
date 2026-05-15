import type { ResolvedLinearConfig } from "./config";

/**
 * System prompt guidance for agents using this extension.
 * Injected into the system prompt via hooks.
 */
export function buildGuidance(config: ResolvedLinearConfig): string {
  const workspaceKeys = Object.keys(config.workspaces);
  const workspaceSummary =
    workspaceKeys.length === 0
      ? "No configured workspaces."
      : workspaceKeys
          .map((workspaceKey) => {
            const profile = config.workspaces[workspaceKey] ?? {};
            const active =
              config.activeWorkspace === workspaceKey ? "active" : "";
            const defaultTeam = profile.defaultTeamKey
              ? `defaultTeam=${profile.defaultTeamKey}`
              : "defaultTeam=(none)";
            const orgName = profile.orgName ?? workspaceKey;
            const status = [active, defaultTeam].filter(Boolean).join(" · ");
            return `- ${orgName} (${workspaceKey})${status ? ` [${status}]` : ""}`;
          })
          .join("\n");

  return `
# Linear

This extension provides tools to interact with Linear issues, projects, milestones, documents, teams, people, and team states.

## Available Tools

- linear_issues: Manage issues, comments, attachments, issue relations, and linked issue documents
- linear_issue_start: Start implementation from an issue (state update + branch kickoff)
- linear_projects: Manage projects and project relations
- linear_project_milestones: Manage project milestones
- linear_documents: Manage Linear documents
- linear_teams: List teams in the workspace
- linear_people: List workspace people to resolve assignee IDs
- linear_team_states: List team workflow states to resolve state IDs

## Workspace Context

${workspaceSummary}

## Usage Guidelines

- Use issue identifiers like ENG-123 when you have them.
- Prefer scoped list/search requests by team, state, assignee, project, or label.
- Before issue create/update with assignment or workflow state, use linear_people and linear_team_states and then pass assigneeId/stateId.
- For updates, pass only the fields that should change.
- For projects, prefer status, lead, and team filters when listing.
- Use linear_project_milestones for milestone CRUD and issue milestone assignment by ID or name when working with project planning.
`;
}
