# pi-init

Experimental Pi extension that provides an interactive `/init` bootstrap flow for projects.

## What it does

- Registers `/init`
- Registers `init_questionnaire` tool (interactive multi-question UI)
- Guides setup for:
  - `AGENTS.md`
  - `.agents/skills/*`
  - `.pi/extensions/index.ts` hooks extension
- Suggests ecosystem packages (`pi-package`) at the end

## Usage

From a repo where this extension is loaded:

```bash
/init
```

The command runs a step-based workflow:
1. Confirm scope (AGENTS.md / Skills / Hooks)
2. Inspect repo and detect gaps
3. Ask targeted follow-up questions
4. Create/update AGENTS.md
5. Create skills
6. Create hooks extension
7. Propose/apply setup fixes
8. Summarize and suggest packages

## Custom tool

`init_questionnaire` is intentionally named to avoid collisions with user/global `ask_user` tools.

## Notes

- This extension is a demo/prototype in `pi-undercooked`.
- Generated hooks target `.pi/extensions/index.ts`.
- Generated skills target `.agents/skills/`.
