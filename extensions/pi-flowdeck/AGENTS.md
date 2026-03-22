# pi-flowdeck

## Scope

This package provides:

- FlowDeck extension tools
- Bundled `flowdeck` skill at `skills/flowdeck`

## Tool design

Subcommands are grouped as tools with actions.

- root: `flowdeck`
- grouped tools: `flowdeck_context`, `flowdeck_config`, `flowdeck_build`, `flowdeck_run`, `flowdeck_test`, `flowdeck_clean`, `flowdeck_apps`, `flowdeck_logs`, `flowdeck_stop`, `flowdeck_uninstall`, `flowdeck_project`, `flowdeck_simulator`, `flowdeck_ui`, `flowdeck_device`

Each tool accepts:

- `args?: string[]`
- `cwd?: string`
- `timeoutSeconds?: number`
- plus `action` for grouped tools that define actions

## Executable policy

Default executable is `flowdeck` from PATH.

Optional override via config:

- `flowdeckExecutable` can point to local binary, ex `.flowdeck-cli/flowdeck`

## License check policy

On session start, extension checks license status using JSON output.

Candidate executable order:
1. configured executable
2. `.flowdeck-cli/flowdeck`
3. `flowdeck`

If no active status detected, emit warning.

## Skills sync

Use `pnpm sync:flowdeck-skills`.

It runs FlowDeck skill install in temp project mode, then copies result into:

- `skills/flowdeck`
