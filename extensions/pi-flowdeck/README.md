# pi-flowdeck

Pi extension + bundled FlowDeck skill pack for Apple project automation.

## Included resources

- Extension: `./src/index.ts`
- Skills: `./skills/flowdeck` (synced from FlowDeck binary installer output)

## Tools exposed

- `flowdeck` (top-level)
- `flowdeck_context`
- `flowdeck_config` (actions: `set|get|reset`)
- `flowdeck_build`
- `flowdeck_run`
- `flowdeck_test` (actions: `run|discover|plans`)
- `flowdeck_clean`
- `flowdeck_apps`
- `flowdeck_logs`
- `flowdeck_stop`
- `flowdeck_uninstall`
- `flowdeck_project` (actions for create/schemes/configs/packages/sync_profiles)
- `flowdeck_simulator` (actions for lifecycle/management/runtime/location/media)
- `flowdeck_ui` (actions for screen/session/gestures/assertions/input)
- `flowdeck_device` (actions: `list|install|uninstall|launch`)

All tools always run in JSON mode.

## FlowDeck executable resolution

By default, the extension uses `flowdeck` from `PATH`.

You can override with config if needed (for local binary path):

```json
{
  "flowdeckExecutable": ".flowdeck-cli/flowdeck"
}
```

## License check

On `session_start`, extension runs:

- `flowdeck license status --json`
- fallback `.flowdeck-cli/flowdeck license status --json` when available

If status is not active, extension emits warning.

## System prompt guidance

By default, extension injects FlowDeck usage guidance during `before_agent_start` so models prefer these tools over raw shell commands for FlowDeck workflows.
Disable with `systemPromptGuidance: false`.

## Install local binary (optional)

```bash
pnpm install:flowdeck-local
```

## Sync bundled skills from binary

```bash
pnpm sync:flowdeck-skills
```

## Extension config

Path: `~/.pi/agent/extensions/flowdeck.json`

```json
{
  "$schema": "https://schemas.aliou.me/@aliou/pi-flowdeck/0.0.1/schema.json",
  "enabled": true,
  "flowdeckExecutable": "flowdeck",
  "defaultTimeoutSeconds": 300,
  "systemPromptGuidance": true
}
```
