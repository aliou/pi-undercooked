# Pi Output Style

Customize how Pi's agent responds with output styles. Switch between educational, hands-on learning, or create your own custom styles.

## Installation

```bash
pi install npm:@aliou/pi-output-style
```

Or from git:

```bash
pi install git:github.com/aliou/pi-output-style
```

## Usage

### Command

```bash
/output-style              # Show style picker
/output-style <name>       # Switch to a style
/output-style off          # Deactivate current style
```

### Flag

Override the active style via command line:

```bash
pi --flag output-style=explanatory
```

## Built-in Styles

### Explanatory

The agent explains its implementation choices and codebase patterns. Before and after writing code, it provides brief educational insights about implementation choices.

### Learning

The agent pauses and asks you to write small pieces of code for hands-on practice. It requests human contributions for meaningful design decisions while handling routine implementation.

## Custom Styles

Create custom styles by adding markdown files to:

- **Global**: `~/.pi/agent/extensions/output-styles/*.md`
- **Local**: `.pi/extensions/output-styles/*.md` (project-specific)

### Style File Format

```markdown
---
name: My Custom Style
description: Brief description shown in the picker
---

Your prompt text here. This will be injected into the system prompt
when the style is active.
```

### Style Resolution

Styles are loaded in this order (later overrides earlier):

1. Built-in styles (Explanatory, Learning)
2. Global custom styles
3. Local custom styles

Style names are case-insensitive.

## Development

### Setup

```bash
# Enable nix environment
nix-shell

# Or with direnv
direnv allow

# Install dependencies
pnpm install
```

### Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format code
- `pnpm changeset` - Create changeset for versioning

## License

MIT
