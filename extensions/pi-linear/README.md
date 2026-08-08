![banner](https://assets.aliou.me/github/aliou/pi-linear/banner.png)

# @aliou/pi-linear

Pi extension for interacting with [Linear](https://linear.app) via the Linear SDK.

## Installation

```
pi install @aliou/pi-linear
```

## Configuration

The extension requires a Linear API key. Get one at https://linear.app/settings/api.

### Option 1: Auth command (recommended)

Run `/linear:auth` in pi to add/edit/remove workspace credentials.

### Option 2: Settings command

Run `/linear:settings` to manage workspaces and extension toggles.

### Option 3: Environment variable

```bash
export LINEAR_API_KEY=lin_api_...
```

If no key is found, the extension disables its tools and shows a warning at session start.

## Commands

| Command | Description |
|---|---|
| `/linear:auth` | Add, edit, or remove workspace credentials |
| `/linear:settings` | Configure workspaces and extension settings |
| `/linear:start [ISSUE_ID]` | Start implementation flow; opens issue picker when no id is provided |
| `/linear:browse` | Tabbed browser (Issues, Projects, Milestones) inspired by Linear navigation |

## Settings

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable or disable the extension |
| `defaultWorkspace` | `string` | auto | Preferred workspace key |
| `startUpdateState` | `"ask"\|"true"\|"false"` | `"ask"` | Default behavior for issue-start state transition |
| `startCreateBranch` | `"ask"\|"true"\|"false"` | `"ask"` | Default behavior for issue-start branch creation |
| `workspaces` | `record` | `{}` | Workspace profiles keyed by org `urlKey` |
| `workspaces.<key>.apiKey` | `string` | — | Workspace API key |
| `workspaces.<key>.orgName` | `string` | — | Workspace display label |
| `workspaces.<key>.defaultTeamKey` | `string` | — | Default team key used when team args are omitted |
| `apiKey` | `string` | legacy | Legacy flat key; auto-migrated into `workspaces.default` |

## Tools

### `linear_issues`

Manage Linear issues and issue-scoped resources.

| Action | Description |
|---|---|
| `list` | List issues, with optional filters like team, project, state, assignee, and label |
| `search` | Full-text search across issues |
| `show` | Show a single issue by ID or identifier (for example `ENG-123`), including sub-issues |
| `create` | Create a new issue in a team |
| `update` | Update an existing issue, including project milestone assignment |
| `comments_list` | List comments for an issue |
| `comment_create` | Create a comment on an issue |
| `comment_update` | Update a comment |
| `comment_delete` | Delete a comment |
| `attachments_list` | List issue attachments |
| `attachment_create` | Attach a URL to an issue |
| `relations_list` | List issue relations, with optional inverse relations |
| `relation_create` | Create an issue relation like `blocks`, `blocked_by`, `duplicate`, `related`, or `similar` |
| `relation_update` | Update an issue relation |
| `relation_delete` | Delete an issue relation |
| `documents_list` | List documents linked to an issue |

Common issue fields include:
- `teamId`, `teamKey`
- `projectId`
- `projectMilestoneId`
- `stateId` (resolve via `linear_team_states`)
- `assigneeId` (resolve via `linear_people`)
- `labelId`, `labelIds`
- `priority`, `dueDate`, `estimate`, `parentId`

### `linear_issue_start`

Start implementation from a Linear issue.

- Input: `id` (required), optional `updateState`, `createBranch`, `allowDirty`
- Behavior:
  - can update issue status to `In Progress` (or `Started` fallback)
  - can create a local branch from Linear suggested `branchName` (fallback generated from issue id/title)
  - if git tree is dirty, stops and asks for explicit confirmation (`allowDirty: true`)
  - if current branch is not default branch, warns but still creates the branch

### `linear_projects`

Manage Linear projects and project relations.

| Action | Description |
|---|---|
| `list` | List projects, with optional filters like team, status, and lead |
| `show` | Show a single project by ID |
| `create` | Create a new project |
| `update` | Update an existing project |
| `relations_list` | List relations for a project |
| `relation_create` | Create a project relation |
| `relation_update` | Update a project relation |
| `relation_delete` | Delete a project relation |

### `linear_project_milestones`

Manage project milestones.

| Action | Description |
|---|---|
| `list` | List milestones for a project. Requires `projectId` |
| `show` | Show a milestone by `milestoneId` |
| `create` | Create a milestone in a project. Requires `projectId` |
| `update` | Update a milestone by `milestoneId` |
| `delete` | Delete a milestone by `milestoneId` |

Milestone fields include:
- `projectId`
- `milestoneId`
- `name`
- `description`
- `targetDate`
- `sortOrder`

### `linear_documents`

Manage Linear documents.

| Action | Description |
|---|---|
| `list` | List documents in the workspace, optionally scoped by `issueId` or `projectId` |
| `show` | Show a document by ID |
| `create` | Create a document, optionally linked to an issue or project |
| `update` | Update a document |
| `delete` | Delete a document |

### `linear_teams`

| Action | Description |
|---|---|
| `list` | List active teams in the workspace |

### `linear_people`

List workspace members for assignment.

| Action | Description |
|---|---|
| `list` | List active people in the workspace with IDs usable as `assigneeId` |

### `linear_team_states`

List workflow states for teams.

| Action | Description |
|---|---|
| `list` | List team states, optionally filtered by `teamId` or `teamKey`; use returned IDs as `stateId` |

## Notes

- Use issue identifiers like `ENG-123` when you have them.
- Prefer scoped list and search requests to keep results small and precise.
- For issue milestone assignment, use `projectMilestoneId`.
- URL attachments are supported directly. Local file upload is not exposed as a first-class helper yet.