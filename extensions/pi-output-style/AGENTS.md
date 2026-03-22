# pi-output-style

Pi extension for customizing agent output styles.

## Purpose

This extension allows users to customize how the agent responds by injecting style-specific prompts into the system prompt. It supports built-in styles (Explanatory, Learning) and custom user-defined styles loaded from markdown files.

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets
- Dependencies: `@aliou/pi-utils-settings`, `gray-matter`

## Structure

```
src/
  index.ts              # Extension entry point
  config.ts             # Configuration schema and loader
  state.ts              # Module-level state for active/loaded styles
  styles/
    types.ts            # OutputStyle interface
    builtin.ts          # Explanatory and Learning styles
    loader.ts           # Style discovery from built-in/global/local sources
  hooks/
    index.ts            # Hook registration
    system-prompt.ts    # Injects active style into system prompt
    reminder.ts         # Injects periodic reminders (hidden from UI)
  commands/
    index.ts            # Command registration
    output-style.ts     # /output-style command with message renderer
```

## Data Model

```typescript
interface OutputStyle {
  name: string;           // Display name
  description?: string;    // UI description
  prompt: string;        // Prompt text injected into system prompt
  source: "built-in" | "global" | "local";
}
```

## Style Discovery

Styles are loaded in priority order (later overrides earlier by name, case-insensitive):

1. **Built-in**: Explanatory, Learning styles defined in `src/styles/builtin.ts`
2. **Global**: `PI_CODING_AGENT_DIR/extensions/output-styles/*.md`
3. **Local**: `<cwd>/.pi/extensions/output-styles/*.md`

Custom style files use YAML frontmatter for metadata and the file body as the prompt.

## System Prompt Integration

The extension uses two hooks:

1. **`before_agent_start`**: Appends the active style's prompt to the system prompt
2. **`context`**: Appends a hidden user message reminder before every LLM call

## Commands

- `/output-style` - Shows style picker with descriptions
- `/output-style <name>` - Switches to named style
- `/output-style off` - Deactivates current style

Style switches are rendered as custom messages in the UI using `registerMessageRenderer`.

## Configuration

Stored at `~/.pi/agent/extensions/output-style.json`:

```json
{
  "enabled": true,
  "activeStyle": "off"
}
```

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format
- `pnpm changeset` - Create changeset for versioning

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes
- `minor`: new features/tools
- `major`: breaking changes
