# pi-linear

Pi extension for interacting with Linear via the `@linear/sdk` TypeScript SDK.

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format
- `pnpm check:lockfile` - Verify lockfile is in sync with package.json
- `pnpm changeset` - Create changeset for versioning

## Structure

```
src/
  index.ts         # Extension entry point, config load + credential gate
  config.ts        # Config schema, defaults, ConfigLoader instance
  client.ts        # Linear SDK client, lazy init, credential resolution
  guidance.ts      # System prompt guidance text
  teams.ts         # Team cache helper (used by issue/project tools)
  commands/
    settings.ts    # /linear:settings command
  tools/           # Tool implementations
    issues/        # linear_issues tool (show, create, list, search, update)
    projects/      # linear_projects tool (show, create, list, update)
    teams/         # linear_teams tool (list)
  hooks/           # Event hooks (system prompt injection)
```

## Authentication

API key resolved in this order:
1. `apiKey` field in `~/.pi/agent/extensions/linear.json`
2. `LINEAR_API_KEY` environment variable

If neither is set, tools are not registered and a warning is shown at session start.

## Client Pattern

The Linear client is lazily initialized on first access via `getLinearClient()`. It returns `null` if no credentials are available. Tools should call this at execution time, not at registration time.

## Extension API Patterns

- `pi.registerTool(tool)` - Register a tool
- `pi.on("before_agent_start", handler)` - Inject guidance into system prompt
- `pi.on("session_start", handler)` - Show notifications at session start

## Conventions

- Tool names prefixed with `linear_` (e.g. `linear_issues`)
- One tool domain per directory in `src/tools/`, with actions in an `actions/` subdirectory
- Forward `signal` to all SDK calls
- Use `onUpdate?.()` with optional chaining
- No `.js` in imports
