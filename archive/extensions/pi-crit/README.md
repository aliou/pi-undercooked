# @aliou/pi-crit

Pi extension for [crit](https://github.com/tomasz-tomczyk/crit) -- browser-based inline code review with commenting.

## Installation

```
pi install @aliou/pi-crit
```

Requires `crit` binary in PATH. The extension's `shell.nix` includes crit via its Nix flake.

## Tools

| Tool | Description |
|---|---|
| `crit_review` | Start a review session. Opens browser UI for file diffs. Auto-detects git changes or accepts explicit file list. |
| `crit_comment` | Add an inline comment at a specific file:line or line range. |
| `crit_comment_reply` | Reply to an existing comment. Optionally resolve it. |
| `crit_comments` | Read all review comments from `.crit.json`. Filter by file or resolved status. |
| `crit_share` | Share a review via a public URL (crit-web). |
| `crit_clear` | Remove `.crit.json` and clear all review state. |
| `crit_pull` | Pull GitHub PR review comments into `.crit.json`. |
| `crit_push` | Push `.crit.json` comments to a GitHub PR. |

## Configuration

Config file: `~/.pi/agent/extensions/crit.json`

```json
{
  "enabled": true,
  "shareUrl": "https://crit.md",
  "author": "Pi ({model})",
  "outputDir": "",
  "systemPromptGuidance": true
}
```

- **shareUrl**: Custom share service URL. Set to empty string to disable sharing.
- **author**: Default author for comments. `{model}` is replaced with the current model ID (e.g. `Pi (claude-opus-4-6)`).
- **outputDir**: Custom directory for `.crit.json` output.
- **systemPromptGuidance**: Inject crit usage guidance into the system prompt.

## Usage

Start a review of git changes:
```
> review the current changes with crit
```

Read and address review feedback:
```
> check crit comments and fix unresolved issues
```

Sync with GitHub PR:
```
> pull crit comments from the PR and address them
```
