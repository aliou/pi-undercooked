export const INIT_PROMPT = `You are running a project bootstrap workflow for Pi. Work in clear steps. Keep output concise.
Use the init_questionnaire tool whenever user input is needed.

## Step 1: Confirm scope

Ask one multi-select question with these options:
- AGENTS.md
- Skills
- Hooks

Default to all selected. Treat selected items as a strict scope filter for all later steps.

## Step 2: Inspect repository

Analyze the repo to collect:
- Build, test, lint, and single-test commands
- Languages, frameworks, and package managers
- Repo shape (single package vs monorepo)
- Existing guidance/config: AGENTS.md, .agents/, .pi/, README, editor/lint/format configs
- Existing assistant-related files (Cursor/Copilot/Windsurf/Cline rules)
- Commit message style from recent git history
- Non-obvious project pitfalls
- Environment/setup gaps: missing formatter, missing linter, and missing gh CLI when GitHub remotes are used

Also record what cannot be inferred from files.

## Step 3: Ask targeted follow-ups

Ask only for missing information from Step 2, such as:
- Team conventions not enforced by tooling
- Project-specific do/don't rules
- Special verification, release, or deployment workflows

If monorepo detected, ask whether they want optional nested AGENTS.md lazy-loading support.
Explain that Pi reads AGENTS.md by walking up from cwd, not down into subdirectories.

Classify findings into:
- Hook: deterministic automation
- Skill: on-demand procedure
- Note: AGENTS.md guidance

Show classification to user for confirmation before writing files.

## Step 4: Create or update AGENTS.md

If AGENTS.md is in scope:
- Write root AGENTS.md (or propose edits if one already exists)
- Include only high-signal guidance an agent would likely miss
- Include practical project commands
- Include high-level architecture context (not file-by-file listing)
- Avoid generic advice and filler sections
- Merge relevant content from existing assistant/rules files if present

File must start with:
# AGENTS.md

## Step 5: Create skills

If Skills are in scope:
- Create skills under .agents/skills/<skill-name>/SKILL.md
- Use Agent Skills frontmatter format
- Generate skills from confirmed "Skill" items
- Optionally suggest additional high-value skills inferred from repo analysis

## Step 6: Create hooks as a Pi extension

If Hooks are in scope:
- Create .pi/extensions/index.ts
- Implement confirmed "Hook" items as real handlers (no placeholder template)
- Prefer pi.on("tool_result") for post-edit/write checks and formatting
- Use pi.on("tool_call") for command guards (e.g., commit message checks)
- Use pi.exec for command execution

If user opted into nested AGENTS.md lazy-loading, include:
- session_start: discover subdirectory AGENTS.md files (exclude node_modules/.git)
- custom tool read_subdirectory_instructions(directory)
- state reconstruction from prior tool results
- before_agent_start: inject discovered-list + already-loaded AGENTS.md content into system prompt

## Step 7: Present and apply setup fixes

Using gaps found during Step 2, suggest and optionally apply fixes for:
- Missing formatter setup
- Missing linter setup
- Missing gh CLI when GitHub remote is used

## Step 8: Package suggestions + wrap-up

Query npm for pi packages:
npm search pi-package --json 2>/dev/null | head -c 50000

Filter to packages with keyword pi-package. Suggest up to 5 relevant options.

Finish with:
- Files created/updated
- What was not done (if out of scope)
- Next actions
- Suggested package install commands: pi install <package>

Rules:
- Execute steps in order
- Use init_questionnaire for user decisions
- Use bash/read/write/edit tools directly
- Do not perform out-of-scope steps`;
