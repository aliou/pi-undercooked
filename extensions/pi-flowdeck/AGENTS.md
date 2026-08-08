# pi-flowdeck

Pi extension wrapping the FlowDeck CLI as Pi tools. Targets FlowDeck 1.25 and Pi 0.83.

## Tool inventory

10 tools wrapping the FlowDeck CLI command surface:

- `flowdeck_session` — manage UI automation sessions (start, stop, status, list, set_active)
- `flowdeck_build` — build, clean
- `flowdeck_run` — run, apps, logs, stop, uninstall
- `flowdeck_test` — test, discover, plans
- `flowdeck_project` — context, schemes, configs, packages (list/add/remove/link/unlink/targets/resolve/update/clear), sync_profiles, create
- `flowdeck_config` — get, set, reset
- `flowdeck_simulator` — lifecycle (list, boot, shutdown, create, delete, erase, clone, prune), runtimes, and device state (appearance, orientation, content size, language, status bar, location, pasteboard, privacy, push, list-apps, app info/container, launch, record)
- `flowdeck_device` — list, install, uninstall, launch
- `flowdeck_ui_simulator` — tap, type, swipe, scroll, find, wait, assert, screen, batch, touch (defaults to active iOS session)
- `flowdeck_ui_mac` — click, type, scroll, hotkey, menu, window (defaults to active macOS session)

## Output parsing

`src/flowdeck/parser.ts` is the critical path. Get this wrong and every tool degrades into a useless error string.

Facts about FlowDeck 1.25 JSON output that the parser depends on:

- Events are NDJSON wrapped in an envelope: `{ "$schema", "payload", "schemaVersion" }`. The real event is in `payload`. Older versions emit the event at the top level, so `unwrapEvent` handles both.
- The terminal event is `payload.type === "result"` with `success: true | false`. It is not always the last line.
- `payload.type === "status"` and `"configuration"` are progress events and must never be treated as the result.
- `payload.type === "build_errors"` and `"test_failures"` carry diagnostics that are collected and prepended to the failure message.
- `userMessage` is more complete than `message` for build and test failures. It contains the Xcode error list and the build log path.
- Messages contain ANSI SGR sequences even under `--json`. They are stripped.
- Some commands write their payload to **stderr**, not stdout. Both streams are parsed, and both are attached to failures.

When a command fails, the model receives the error message, the command line, the exit code, and the tail of both raw streams. Withholding this previously drove agents to re-run everything through raw `bash`.

## Error signalling

Pi's agent loop hardcodes `isError: false` for any tool that returns normally (`packages/agent/src/agent-loop.ts`). The `isError` field on a returned result is ignored. The only way to flag a failure is to throw.

`src/tools/utils.ts` handles this: `finishToolResult` emits the structured details through `onUpdate` first, so the TUI keeps them, then throws a `FlowDeckToolError`. Because Pi resets `details` to `{}` on a thrown error, every `renderResult` must call `hasResult(details)` before reading `details.result`.

## Screenshot policy

Screenshots are attached only for the `screen` and `session_start` actions, or when the caller passes `screenshot: true`. The accessibility tree is the source of truth.

This matters: in one real project, `flowdeck_ui_simulator` returned 213 images and 1.5M characters across 238 calls, which was roughly 90% of all FlowDeck token spend. Most of those images followed taps and added nothing.

Use `interactiveElements` and `sinceHash` on `screen` to cut tree size further, and `batch` to collapse a multi-step flow into one call.

## Session state

The `flowdeck_session` tool is the state owner. It uses `pi.appendEntry("flowdeck-session", data)` for durable state that survives compaction and restarts.

State lifecycle:
- `session_start` and `session_tree` hooks (registered in `src/tools/session/index.ts`) reconstruct state from Pi session entries
- `session_shutdown` hook stops all running FlowDeck capture processes
- UI tools (`flowdeck_ui_simulator`, `flowdeck_ui_mac`) read the shared registry via `getRegistry()` to default `simulator`/`app` params

Entry types stored in Pi session:
- `{ event: "started", platform, sessionId, sessionDir, latestScreenshot, latestTree, target, ... }`
- `{ event: "stopped", platform, sessionId, stoppedAt, reason }`
- `{ event: "active-set", platform, sessionId }`

One active session per platform (ios, mac). UI tools default to the active session's target when their `simulator`/`app` param is omitted.

`flowdeck_session`, `flowdeck_ui_simulator`, and `flowdeck_ui_mac` all set `executionMode: "sequential"` because they mutate this shared in-memory registry and drive one device.

## Architecture

- Domain logic is Pi-free: `src/flowdeck/client.ts`, `parser.ts`, `types.ts`, `session-state.ts`, `registry.ts`
- Tools are thin wrappers: schemas in `args.ts`/`schema.ts`, execution in per-tool `index.ts`
- TUI rendering uses shared components: `FlowDeckToolLayout`, `FlowDeckActionHeader`, `buildField`, `buildStatusLine`, `buildPartialBody`, `buildErrorBody`, `buildExpandFooter`
- Pattern follows pi-processes: multi-action tools with per-action render, compact collapsed / detailed expanded

## Hooks

- `before_agent_start` (`src/hooks/index.ts`) injects short guidance about using FlowDeck instead of Apple CLIs
- `session_start` / `session_tree` / `session_shutdown` live in `src/tools/session/index.ts`

## Verifying CLI changes

Never guess a FlowDeck subcommand or flag. Check it first:

```
flowdeck <command> --help
flowdeck <command> <subcommand> --help
```

`flowdeck ui simulator record` does not exist, for example; recording lives at `flowdeck simulator record`. An earlier version of this extension shipped that invalid mapping.

## Skills

Full FlowDeck workflow documentation is in `skills/flowdeck/SKILL.md` with resource docs in `skills/flowdeck/resources/`. That directory ships with the package via `pi.skills`.
