# pi-crit

Pi extension wrapping the [crit](https://github.com/tomasz-tomczyk/crit) CLI for inline code review with browser-based UI.

## Purpose

Provides tools for agents to start reviews, add/read inline comments, share reviews, and sync with GitHub PRs. All operations go through the `crit` CLI binary which must be available in PATH (included in shell.nix).

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets
- Requires `crit` binary (Nix flake from `github:tomasz-tomczyk/crit`)

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format
- `pnpm gen:schema` - Regenerate config JSON schema
- `pnpm check:lockfile` - Verify lockfile is in sync with package.json
- `pnpm changeset` - Create changeset for versioning

## Structure

```
src/
  index.ts              # Entry point: load config, check enabled, register hooks + tools
  config.ts             # CritConfig / ResolvedCritConfig + ConfigLoader
  guidance.ts           # System prompt guidance text
  hooks/
    index.ts            # Hook registration
    system-prompt.ts    # Injects guidance into system prompt
  tools/
    index.ts            # Registers all tools
    crit-review.ts      # Start a review session (browser daemon)
    crit-comment.ts     # Add inline comment at file:line
    crit-comment-reply.ts  # Reply to existing comment
    crit-comments.ts    # Read .crit.json comments
    crit-share.ts       # Share review via crit-web URL
    crit-clear.ts       # Clear .crit.json
    crit-pull.ts        # Pull GitHub PR comments
    crit-push.ts        # Push comments to GitHub PR
  utils/
    author.ts           # Resolve author template with model ID
    exec.ts             # Wrapper around pi.exec for crit CLI
```

## Entry Point Deviations

None. Standard pattern: load config -> check enabled -> register hooks + tools.

## Config

Stored at `~/.pi/agent/extensions/crit.json`. Fields:

| Field | Type | Default | Description |
|---|---|---|---|
| enabled | boolean | true | Enable/disable extension |
| shareUrl | string | "https://crit.md" | Custom share service URL |
| author | string | "Pi ({model})" | Default comment author. `{model}` is replaced with current model ID. |
| outputDir | string | "" | Custom output directory for .crit.json |
| systemPromptGuidance | boolean | true | Inject tool guidance into system prompt |

## Tool Naming

Tools are prefixed with `crit_` since they wrap the crit CLI (third-party integration pattern).
