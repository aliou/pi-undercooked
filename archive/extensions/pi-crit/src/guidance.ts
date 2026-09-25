/**
 * System prompt guidance for agents using crit tools.
 * Injected into the system prompt via hooks.
 */
export const CRIT_GUIDANCE = `
## Crit -- Inline Code Review

Crit provides browser-based code review with inline comments. Use the crit tools to manage reviews.

### Available Tools

- \`crit_review\`: Start a review session (opens browser UI with file diffs)
- \`crit_comment\`: Add an inline comment at a specific file:line
- \`crit_comment_reply\`: Reply to an existing comment, optionally resolving it
- \`crit_comments\`: Read all current review comments from .crit.json
- \`crit_share\`: Share a review via a public URL
- \`crit_unpublish\`: Remove a shared review from crit-web
- \`crit_clear\`: Remove .crit.json and reset review state
- \`crit_pull\`: Pull GitHub PR comments into .crit.json
- \`crit_push\`: Push .crit.json comments to a GitHub PR

### When to use crit tools

- User asks you to review code or leave review comments
- User asks you to read review feedback (use \`crit_comments\`)
- User wants to share a review or sync with a GitHub PR
- After making changes, use \`crit_comments\` to check if there are unresolved review comments to address

### When NOT to use crit tools

- For simple code reading (use \`read\` instead)
- For quick one-off feedback (just respond in chat)
- For editing files (use \`edit\` or \`write\` instead)

### Workflow

1. Read comments: \`crit_comments\` to see what reviewers said
2. Address feedback: edit files to fix issues
3. Reply + resolve: \`crit_comment_reply\` with resolve=true after fixing
4. For GitHub PRs: \`crit_pull\` to get comments, work on them, \`crit_push\` to post replies
`;
