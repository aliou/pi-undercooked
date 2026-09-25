# @aliou/pi-flowdeck

Pi extension wrapping the [FlowDeck](https://flowdeck.studio) CLI — the Apple platform build/run/test/simulator/device/UI-automation tool that replaces xcodebuild, xcrun simctl, and all Apple CLIs with structured JSON output.

## Tools

| Tool | Description |
|---|---|
| `flowdeck_build` | Build or clean Xcode projects |
| `flowdeck_run` | Run apps, list running apps, stream logs, stop/uninstall apps |
| `flowdeck_test` | Run tests, discover tests, list test plans |
| `flowdeck_project` | Discover project structure, schemes, configs, manage SPM packages |
| `flowdeck_config` | Check, save, or reset FlowDeck project settings |
| `flowdeck_simulator` | Simulators, runtimes, and device state (appearance, Dynamic Type, orientation, language, status bar, location, privacy, push) |
| `flowdeck_device` | List and manage physical Apple devices |
| `flowdeck_session` | Manage UI automation sessions (start, stop, status, list, set_active) |
| `flowdeck_ui_simulator` | iOS Simulator UI automation (tap, type, swipe, assert, batch flows) |
| `flowdeck_ui_mac` | macOS app UI automation (click, type, hotkey, menus, windows) |

Requires FlowDeck 1.25 or newer.

## Sessions

FlowDeck sessions are background capture processes that continuously write screenshots and accessibility trees. The `flowdeck_session` tool manages session lifecycle and tracks state in the Pi session.

- Start a session before any UI work: `flowdeck_session action=start platform=ios simulator="iPhone 16"`
- The `simulator` and `app` params on UI tools default to the active session target when omitted
- Session state persists across compaction and restarts via `pi.appendEntry()`
- Active sessions are cleaned up when Pi exits

## Keeping UI automation cheap

The accessibility tree is the source of truth. Screenshots are attached only for
the `screen` and `session_start` actions, or when you pass `screenshot=true`.

Three options cut context use further:

| Option | Effect |
|---|---|
| `action=batch` | Runs a whole flow in one call and returns only the final tree |
| `interactiveElements=true` | Returns only actionable elements instead of the full tree |
| `sinceHash=<hash>` | Returns `unchanged` when the screen has not moved since that capture |

## Error output

When a FlowDeck command fails, the tool returns the parsed error message, the
command line, the exit code, and the tail of both stdout and stderr. Build and
test failures include the Xcode diagnostics and the FlowDeck build log path.

## Installation

```bash
pi install @aliou/pi-flowdeck
```

Requires the [FlowDeck CLI](https://flowdeck.studio) installed and in PATH.

## Configuration

Stored at `~/.pi/agent/extensions/flowdeck.json`.

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Enable or disable the extension |
| `binaryPath` | `"flowdeck"` | Path to the flowdeck binary |

## Architecture

```
src/
  flowdeck/          # Pi-free domain layer
    client.ts        # FlowDeckClient - command execution
    parser.ts        # JSON output parsing
    types.ts         # Domain result types
    session-state.ts # Session state types and reducer
    registry.ts      # Shared in-memory session registry
  tools/             # Pi tool wrappers
    components/      # Shared TUI components (ToolLayout, ActionHeader, fields)
    args.ts          # CLI argument builders
    schema.ts        # TypeBox parameter schemas
    create-client.ts # Client factory from pi.exec
    session/         # flowdeck_session tool (state owner)
    build/           # flowdeck_build tool
    run/             # flowdeck_run tool
    test/            # flowdeck_test tool
    project/         # flowdeck_project tool
    config/          # flowdeck_config tool
    simulator/       # flowdeck_simulator tool
    device/          # flowdeck_device tool
    ui-simulator/    # flowdeck_ui_simulator tool (reads session state)
    ui-mac/          # flowdeck_ui_mac tool (reads session state)
  hooks/             # before_agent_start guidance injection
  config.ts          # Extension configuration
```

## License

MIT
