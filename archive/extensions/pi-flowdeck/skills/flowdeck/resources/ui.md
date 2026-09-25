# ui - UI Automation (iOS Simulator & macOS Apps)

UI automation is a top-level command group with two subgroups:
- **`flowdeck ui simulator`** — iOS simulator automation (screen capture, gestures, taps, typing, assertions, app control)
- **`flowdeck ui mac`** — macOS app automation (screenshots, clicks, typing, scrolling, menus, windows, app lifecycle)

Do not use `flowdeck simulator ui`. Commands are kebab-case (for example: `double-tap`, `double-click`, `right-click`, `hide-keyboard`).

---

## iOS Simulator Automation (`flowdeck ui simulator`)

**Guidance:**
- Always pass `-S <name-or-udid>` (or `--simulator`) on every `flowdeck ui simulator ...` command in automation. It accepts either a simulator name (for example, `"iPhone 16"`) or a raw UDID.
- **Start a session BEFORE any UI work**: `flowdeck ui simulator session start -S "iPhone 16" --json`. Parse the JSON output to get the `latest_screenshot` and `latest_tree` file paths. Use your Read tool on those paths to see the screen and inspect elements.
- **Verify after EVERY action**: after each tap/type/swipe, wait about 1 second, then re-read `latest_screenshot` or `latest_tree`. Never chain actions without checking the result.
- **If a session looks stale, restart it**: run `flowdeck ui simulator session start -S "iPhone 16" --json` again, replace the saved `latest_*` paths, and continue with the restarted session. Do not switch to `screen` as the first response to suspected session staleness.
- **Use the app's own UI when testing browser apps**: do not use `flowdeck ui simulator open-url` to validate website loading or browser navigation. Use the browser's address/search field and in-app controls. Reserve `open-url` for explicit deep-link or system handoff tests.
- **Do not invent FlowDeck syntax**: if you are unsure about flags, keycodes, or subcommand arguments, run `flowdeck ui simulator <subcommand> --help` first. Do not guess unsupported flags like `--x/--y` or string key names.
- Prefer accessibility identifiers and `--by-id` whenever the app exposes them.
- For off-screen elements, use `flowdeck ui simulator scroll --until "id:yourElement" -S "iPhone 16"` before tapping.
- Coordinate-based commands accept `--geometry points`. Do not scale by @2x/@3x or device resolution; FlowDeck coordinates already match point-normalized screenshots.
- Most subcommands support `-j, --json`, `-v, --verbose`, and `-e, --examples`. If you are unsure about current flags, run `flowdeck ui simulator <subcommand> --help`.

#### ui simulator screen

Capture a screenshot and accessibility tree from a simulator.

The accessibility tree is returned by default. A screenshot requires `--screenshot`.

```bash
flowdeck ui simulator screen -S "iPhone 16" --json
flowdeck ui simulator screen -S "iPhone 16" --json --interactive-elements
flowdeck ui simulator screen -S "iPhone 16" --json --since-hash 5efb279cd01f5b5c
flowdeck ui simulator screen -S "iPhone 16" --json --screenshot --output ./screen.png --optimize
```

**Options:**
| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output path for screenshot |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |
| `--screenshot` | Also capture an image. Off by default; the tree is the source of truth |
| `--optimize` | Optimize screenshot for agents (smaller size) |
| `--interactive-elements` | Return only actionable elements instead of the full tree |
| `--since-hash <hash>` | Return `unchanged` when the screen hash still matches |
| `--tree` | Deprecated. The tree is returned by default; accepted for compatibility |

**Notes:**
- Prefer `--interactive-elements` when you only need tap targets, and `--since-hash` to skip repeated trees. Both cut context use sharply.
- Only add `--screenshot` when a value is rendered without accessibility data, such as custom graphics or charts.
- `screen` reports coordinates in points. JSON includes point and pixel dimensions when available.
- If `-S` is omitted, FlowDeck falls back to the session/default simulator. Agents should not rely on that.
- `screen` is a fallback for explicit one-off captures, not the default way to recover from a possibly stale session.

#### ui simulator session

Start or stop a background capture session. Requires a booted simulator. `session start` stops any active session first and writes captures into `./.flowdeck/automation/sessions/<session-short-id>/`.

```bash
flowdeck ui simulator session start -S "iPhone 16" --json
flowdeck ui simulator session stop -S "iPhone 16"
```

**Options (`session start`):**
| Option | Description |
|--------|-------------|
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |
| `--interval-ms <ms>` | Capture interval in milliseconds (default: `500`) |
| `--retention-seconds <seconds>` | Retention window in seconds (default: `60`) |

**Session Files:**
- `latest.jpg` points to the latest screenshot.
- `latest-tree.json` points to the latest accessibility tree.
- `latest.json` points to the latest capture metadata.
- JSON output from `session start` includes absolute paths for the session directory and latest files.

**If the session appears stale:**
1. Wait briefly and re-read the same `latest.jpg` / `latest-tree.json` paths.
2. If they still do not reflect an obvious UI change, run `flowdeck ui simulator session start -S "iPhone 16" --json` again.
3. Save the new `latest_screenshot`, `latest_tree`, and `latest` paths from the restarted session.
4. Continue with the restarted session. Only fall back to `screen` if the restarted session is still wrong.

#### ui simulator batch

Run a whole flow in one invocation. Spans screens, auto-scrolls, and asserts,
returning only the final tree. Prefer this over chaining separate tap and screen
calls.

```bash
flowdeck ui simulator batch -S "iPhone 16" --json --steps '[{"action":"tap","target":"Media"},{"action":"assert","assertion":"visible","target":"Photos"}]'
flowdeck ui simulator batch -S "iPhone 16" --json -f ./flow.json --interactive-elements
```

**Options:**
| Option | Description |
|--------|-------------|
| `--steps <json>` | JSON array of action steps |
| `-f, --file <path>` | Path to a JSON file of action steps |
| `--interactive-elements` | Return only interactive elements in the final snapshot |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### simulator record

Record simulator video. This lives under `simulator`, not `ui simulator`.

```bash
flowdeck simulator record -S "iPhone 16" --output-file ./demo.mov
flowdeck simulator record -S "iPhone 16" --duration 20s --codec hevc
```

**Options:**
| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output folder (default `~/Desktop`) |
| `--output-file <path>` | Exact output video path |
| `-t, --duration <duration>` | Recording duration, e.g. `10s` |
| `--codec <codec>` | `h264` or `hevc` |
| `--stop-file <path>` | Stop recording when this file appears |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator find

Find an element and return its info/text.

```bash
flowdeck ui simulator find "Settings" -S "iPhone 16"
flowdeck ui simulator find "settings_button" -S "iPhone 16" --by-id
flowdeck ui simulator find "button" -S "iPhone 16" --by-role
flowdeck ui simulator find "Log" -S "iPhone 16" --contains
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<target>` | Element to find (label, ID, or role) |

**Options:**
| Option | Description |
|--------|-------------|
| `--by-id` | Search by accessibility identifier |
| `--by-role` | Search by element role (for example `button`, `textField`) |
| `--contains` | Match elements containing the text |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator tap

Tap an element by label or accessibility identifier, or tap coordinates.

```bash
flowdeck ui simulator tap "Log In" -S "iPhone 16"
flowdeck ui simulator tap "login_button" -S "iPhone 16" --by-id
flowdeck ui simulator tap --point 120,340 -S "iPhone 16"
flowdeck ui simulator tap --point 120,340 --geometry points -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<target>` | Element label/ID to tap (or use `--point`) |

**Options:**
| Option | Description |
|--------|-------------|
| `-p, --point <point>` | Tap at coordinates (`x,y`) |
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `-d, --duration <seconds>` | Hold duration for a long press |
| `--by-id` | Treat target as an accessibility identifier |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator double-tap

Double tap an element or coordinates.

```bash
flowdeck ui simulator double-tap "Like" -S "iPhone 16"
flowdeck ui simulator double-tap "like_button" -S "iPhone 16" --by-id
flowdeck ui simulator double-tap --point 160,420 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<target>` | Element label/ID to double tap (or use `--point`) |

**Options:**
| Option | Description |
|--------|-------------|
| `-p, --point <point>` | Coordinates to double tap (`x,y`) |
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `--by-id` | Search by accessibility identifier |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator type

Type text into the focused element.

```bash
flowdeck ui simulator type "hello@example.com" -S "iPhone 16"
flowdeck ui simulator type "hunter2" -S "iPhone 16" --mask
flowdeck ui simulator type "New Value" -S "iPhone 16" --clear
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<text>` | Text to type |

**Options:**
| Option | Description |
|--------|-------------|
| `--clear` | Clear the field before typing |
| `--mask` | Mask the typed text in terminal output and JSON |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator swipe

Swipe on the screen.

```bash
flowdeck ui simulator swipe up -S "iPhone 16"
flowdeck ui simulator swipe --from 120,700 --to 120,200 --duration 0.5 -S "iPhone 16"
flowdeck ui simulator swipe down --distance 0.25 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<direction>` | Swipe direction: `up`, `down`, `left`, or `right` |

**Options:**
| Option | Description |
|--------|-------------|
| `--from <point>` | Start point (`x,y`) |
| `--to <point>` | End point (`x,y`) |
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `--duration <seconds>` | Swipe duration in seconds (default: `0.3`) |
| `--distance <fraction>` | Swipe distance as a fraction of the screen (`0.05`-`0.95`, default: `0.4`) |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator scroll

Scroll content more gently than `swipe`.

```bash
flowdeck ui simulator scroll --direction DOWN -S "iPhone 16"
flowdeck ui simulator scroll --until "Settings" --timeout 10000 -S "iPhone 16"
flowdeck ui simulator scroll --until "id:yourElement" -S "iPhone 16"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-d, --direction <direction>` | Scroll direction by content: `UP`, `DOWN`, `LEFT`, `RIGHT` |
| `-s, --speed <speed>` | Scroll speed `0`-`100` (default: `40`) |
| `--distance <fraction>` | Scroll distance as a fraction of the screen (`0.05`-`0.95`, default: `0.2`) |
| `--until <target>` | Scroll until the target becomes visible |
| `--timeout <ms>` | Timeout for `--until` in milliseconds |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator back

Navigate back with the simulator back gesture.

```bash
flowdeck ui simulator back -S "iPhone 16"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator pinch

Pinch to zoom in or out.

```bash
flowdeck ui simulator pinch out -S "iPhone 16"
flowdeck ui simulator pinch in --scale 0.6 --point 200,400 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<direction>` | `in` for zoom out, `out` for zoom in |

**Options:**
| Option | Description |
|--------|-------------|
| `--scale <scale>` | Scale factor (defaults: `2.0` for `out`, `0.5` for `in`) |
| `-p, --point <point>` | Pinch center point (`x,y`) |
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `--duration <seconds>` | Pinch duration in seconds |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator wait

Wait for an element condition.

```bash
flowdeck ui simulator wait "Loading..." -S "iPhone 16"
flowdeck ui simulator wait "Submit" --enabled --timeout 15 -S "iPhone 16"
flowdeck ui simulator wait "Toast" --gone -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<target>` | Element to wait for |

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --timeout <seconds>` | Timeout in seconds (default: `30`) |
| `--poll <ms>` | Poll interval in milliseconds (default: `500`) |
| `--gone` | Wait for the element to disappear |
| `--enabled` | Wait for the element to become enabled |
| `--stable` | Wait for the element to stop moving |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator assert

Assert element conditions.

```bash
flowdeck ui simulator assert visible "Profile" -S "iPhone 16"
flowdeck ui simulator assert hidden "Spinner" -S "iPhone 16"
flowdeck ui simulator assert enabled "Submit" -S "iPhone 16"
flowdeck ui simulator assert disabled "Continue" -S "iPhone 16"
flowdeck ui simulator assert text "Welcome" -S "iPhone 16" --expected "Hello"
```

**Subcommands:**
| Subcommand | Description |
|------------|-------------|
| `visible <target>` | Assert the element is visible |
| `hidden <target>` | Assert the element is hidden |
| `enabled <target>` | Assert the element is enabled |
| `disabled <target>` | Assert the element is disabled |
| `text <target>` | Assert the element text matches |

**Common Options:**
| Option | Description |
|--------|-------------|
| `--by-id` | Search by accessibility identifier |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

**Text Options:**
| Option | Description |
|--------|-------------|
| `--expected <text>` | Expected text value |
| `--contains` | Check whether the text contains the expected value |

#### ui simulator erase

Erase text from the focused field.

```bash
flowdeck ui simulator erase -S "iPhone 16"
flowdeck ui simulator erase --characters 5 -S "iPhone 16"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-c, --characters <count>` | Number of characters to erase (omit to clear all) |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator hide-keyboard

Hide the on-screen keyboard.

```bash
flowdeck ui simulator hide-keyboard -S "iPhone 16"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator key

Send HID keyboard key codes.

```bash
flowdeck ui simulator key 40 -S "iPhone 16"
flowdeck ui simulator key --sequence 40,42 -S "iPhone 16"
flowdeck ui simulator key 42 --hold 0.2 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<keycode>` | HID keycode (for example `40` for Enter, `42` for Backspace) |

**Options:**
| Option | Description |
|--------|-------------|
| `--sequence <codes>` | Comma-separated HID keycodes |
| `--hold <seconds>` | Hold duration in seconds |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

**Notes:**
- `key` expects numeric HID keycodes, not string names. For example, Enter/Return is `40`.
- If you are unsure which keycode you need, run `flowdeck ui simulator key --help` before retrying.

#### ui simulator open-url

Open a URL or deep link in the simulator.

```bash
flowdeck ui simulator open-url https://example.com -S "iPhone 16"
flowdeck ui simulator open-url myapp://path -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<url>` | URL or deep link to open |

**Options:**
| Option | Description |
|--------|-------------|
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

**Notes:**
- `open-url` hands the URL to the simulator/OS. It may open Safari or another registered app.
- Do not use `open-url` to validate browser-app navigation. Use the browser's own address bar and controls instead.

#### ui simulator clear-state

Clear app data/state from the simulator.

```bash
flowdeck ui simulator clear-state com.example.app -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<bundle-id>` | Bundle identifier for the app to reset |

**Options:**
| Option | Description |
|--------|-------------|
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator rotate

Rotate with a two-finger gesture.

```bash
flowdeck ui simulator rotate 90 -S "iPhone 16"
flowdeck ui simulator rotate -45 --point 200,400 --radius 80 --duration 0.5 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<angle>` | Rotation angle in degrees (positive = clockwise, negative = counterclockwise) |

**Options:**
| Option | Description |
|--------|-------------|
| `-p, --point <point>` | Rotation center point (`x,y`) |
| `--radius <radius>` | Radius in points for the two-finger rotation (default: `80`) |
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `--duration <seconds>` | Rotate duration in seconds |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator set-appearance

Set the simulator appearance to light or dark mode.

```bash
flowdeck ui simulator set-appearance light -S "iPhone 16"
flowdeck ui simulator set-appearance dark -S "iPhone 16"
flowdeck ui simulator set-appearance dark -S "iPhone 16" --json
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<appearance>` | Appearance style: `light` or `dark` |

**Options:**
| Option | Description |
|--------|-------------|
| `-S, --simulator <name-or-udid>` | Simulator name or UDID (defaults to booted simulator) |
| `-j, --json` | Output as JSON |
| `-e, --examples` | Show usage examples |

#### ui simulator button

Press a hardware button.

```bash
flowdeck ui simulator button home -S "iPhone 16"
flowdeck ui simulator button lock --hold 1.0 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<button>` | `home`, `lock`, `siri`, `applepay`, `volumeup`, or `volumedown` |

**Options:**
| Option | Description |
|--------|-------------|
| `--hold <seconds>` | Hold duration in seconds |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator touch down

Touch down at coordinates.

```bash
flowdeck ui simulator touch down 120,340 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<point>` | Point coordinates (`x,y`) in screen points |

**Options:**
| Option | Description |
|--------|-------------|
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### ui simulator touch up

Touch up at coordinates.

```bash
flowdeck ui simulator touch up 120,340 -S "iPhone 16"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<point>` | Point coordinates (`x,y`) in screen points |

**Options:**
| Option | Description |
|--------|-------------|
| `--geometry <geometry>` | Coordinate geometry (`points` only) |
| `-S, --simulator <name-or-udid>` | Simulator name or UDID |

#### UI Timing Tuning (Simulator)

Set these environment variables when you need to slow input or improve stability:

- `FLOWDECK_HID_STABILIZATION_MS` adds settle time between HID events (default: `25`)
- `FLOWDECK_TYPE_DELAY_MS` adds per-character typing delay (default: `20`)

---

## macOS App Automation (`flowdeck ui mac`)

Use `flowdeck ui mac` for automating native macOS apps via the Accessibility framework and CGEvent-based input. This works on any running macOS GUI app — your own builds, system apps, or third-party apps.

**Guidance:**
- Always pass `--app <name-or-bundle-id-or-pid>` on every `flowdeck ui mac ...` command.
- App resolution: numeric → PID, contains dot → bundle ID, otherwise → fuzzy name match.
- **Check permissions first**: run `flowdeck ui mac check-permissions` — Accessibility and Screen Recording must be granted.
- **Verify after EVERY action**: after each click/type/scroll, use `flowdeck ui mac screen --app "..." --tree --json` to confirm the UI changed. Never chain actions without checking.
- Prefer accessibility identifiers (`--by-id`) over labels — faster and more reliable.
- Coordinates are screen-absolute points (matching `find` output). Do not scale by Retina factors.
- `click` is the primary command on macOS (`tap` is a hidden alias). Use `right-click` for context menus.
- **Do not invent FlowDeck syntax**: if unsure about flags, run `flowdeck ui mac <subcommand> --help`.
- Most subcommands support `--json` for machine-readable output.

#### ui mac session

Start or stop a background capture session for a macOS app. Captures screenshots and accessibility trees continuously at a configurable interval. `session start` stops any active macOS session first and writes captures into `./.flowdeck/automation/mac-sessions/<session-short-id>/`.

```bash
flowdeck ui mac session start --app "Safari" --json
flowdeck ui mac session stop
```

**Options (`session start`):**
| Option | Description |
|--------|-------------|
| `--app <name-or-bid-or-pid>` | Target app (required) |
| `--interval-ms <ms>` | Capture interval in milliseconds (default: `500`) |
| `--retention-seconds <seconds>` | Retention window in seconds (default: `60`) |

**Session Files:**
- `latest.jpg` points to the latest screenshot.
- `latest-tree.json` points to the latest accessibility tree.
- `latest.json` points to the latest capture metadata.
- JSON output from `session start` includes absolute paths for the session directory and latest files.

**Usage pattern (same as iOS simulator sessions):**
1. Start the session: `flowdeck ui mac session start --app "MyApp" --json`
2. Parse the JSON output. Extract `latest_screenshot`, `latest_tree`, and `session_dir` paths.
3. Read `latest-tree.json` with the Read tool to discover elements.
4. Read `latest.jpg` (latest screenshot) with the Read tool to see the UI.
5. Interact with the app using `flowdeck ui mac click`, `type`, `scroll`, etc.
6. After each action, wait about 1 second, then re-read the latest files to verify.
7. Stop the session when done: `flowdeck ui mac session stop`

**If the session appears stale:**
1. Wait briefly and re-read the same `latest.jpg` / `latest-tree.json` paths.
2. If they still do not reflect an obvious UI change, run `flowdeck ui mac session start --app "MyApp" --json` again.
3. Save the new paths from the restarted session and continue.

**Differences from iOS simulator sessions:**
- Uses `--app` instead of `-S` (simulator).
- Session data is stored in `.flowdeck/automation/mac-sessions/` (separate from iOS sessions).
- If the target app quits, the session detects consecutive capture failures and stops automatically.
- Requires Accessibility and Screen Recording permissions (macOS 14+ for screenshots).

#### ui mac check-permissions

Check if Accessibility and Screen Recording permissions are granted.

```bash
flowdeck ui mac check-permissions --json
```

#### ui mac request-permissions

Trigger system permission dialogs for Accessibility, Screen Recording, and Automation.

```bash
flowdeck ui mac request-permissions
flowdeck ui mac request-permissions --json
```

**Notes:**
- Prompts for Accessibility, Screen Recording, and Automation (Apple Events) permissions.
- Automation permission is triggered by sending a test Apple Event to Finder.
- After granting permissions in System Settings > Privacy & Security, restart your terminal.

#### ui mac screen

Capture a screenshot and accessibility tree from a macOS app.

```bash
flowdeck ui mac screen --app "Safari" --json
flowdeck ui mac screen --app "Safari" --output ./screen.png
flowdeck ui mac screen --app "Safari" --tree --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--app <name-or-bid-or-pid>` | Target app (required) |
| `-o, --output <path>` | Output path for screenshot (PNG) |
| `--tree` | Accessibility tree only (no screenshot) |
| `--json` | Output as JSON |

**Notes:**
- Screenshots require macOS 14+ and Screen Recording permission.
- Use `--tree --json` to get element labels, IDs, roles, and frames for automation planning.

#### ui mac click

Click an element by label or accessibility identifier, or click coordinates.

```bash
flowdeck ui mac click "Log In" --app "MyApp"
flowdeck ui mac click "login_button" --app "MyApp" --by-id
flowdeck ui mac click --point 120,340 --app "MyApp"
flowdeck ui mac click --point 120,340 --duration 2.0 --app "MyApp"  # long press
```

**Options:**
| Option | Description |
|--------|-------------|
| `<target>` | Element label/ID to click (or use `--point`) |
| `--app <name-or-bid-or-pid>` | Target app |
| `--point <x,y>` | Click at screen-absolute coordinates |
| `--by-id` | Treat target as an accessibility identifier |
| `--duration <seconds>` | Hold duration (long press) |

#### ui mac double-click

Double-click an element or coordinates.

```bash
flowdeck ui mac double-click "word" --app "TextEdit"
flowdeck ui mac double-click --point 200,300 --app "MyApp"
```

#### ui mac right-click

Right-click (context menu) an element or coordinates.

```bash
flowdeck ui mac right-click "item" --app "Finder"
flowdeck ui mac right-click --point "200,300" --app "MyApp"
```

**Notes:**
- **Right-click by label often fails on SwiftUI List rows and other composite views** because the accessibility tree exposes the container, not the child text. If `right-click "Label"` returns "Element not found", extract the element's center coordinates from the tree and use `--point "x,y"` instead.
- `--point` format is comma-separated and quoted: `--point "200,300"`. Space-separated values like `--point 200 300` will fail.

#### ui mac type

Type text into the focused element.

```bash
flowdeck ui mac type "hello@example.com" --app "MyApp"
flowdeck ui mac type "secret123" --app "MyApp" --mask
flowdeck ui mac type "New Value" --app "MyApp" --clear
flowdeck ui mac type "fast typing" --app "MyApp" --delay-ms 5
```

**Options:**
| Option | Description |
|--------|-------------|
| `<text>` | Text to type |
| `--app <name-or-bid-or-pid>` | Target app |
| `--clear` | Clear field before typing (Cmd+A, Delete) |
| `--mask` | Mask typed text in terminal output and JSON |
| `--delay-ms <ms>` | Per-character delay in milliseconds |

#### ui mac erase

Erase text from the focused field.

```bash
flowdeck ui mac erase --app "MyApp"
flowdeck ui mac erase --characters 5 --app "MyApp"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--characters <count>` | Number of characters to erase (omit to clear all via Cmd+A, Delete) |

#### ui mac key

Press a key by name or virtual keycode.

```bash
flowdeck ui mac key --name return --app "MyApp"
flowdeck ui mac key --name escape --app "MyApp"
flowdeck ui mac key --keycode 36 --app "MyApp"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--name <key>` | Key name: `return`, `escape`, `tab`, `delete`, `space`, `f1`-`f12`, arrows, etc. |
| `--keycode <code>` | Raw virtual keycode |

**Notes:**
- Use `--name` for human-readable keys. Use `--keycode` for keys without a named mapping.
- Must specify either `--name` or `--keycode`.
- **DO NOT pass key names as positional arguments.** `key "delete"` will fail. Use `key --name delete`.
- **DO NOT confuse with iOS `key`**, which takes numeric HID keycodes. macOS `key` uses `--name` or `--keycode`.

#### ui mac hotkey

Press a keyboard shortcut combination.

```bash
flowdeck ui mac hotkey "cmd+s" --app "TextEdit"
flowdeck ui mac hotkey "cmd+shift+z" --app "MyApp"
flowdeck ui mac hotkey "cmd+c" --app "Safari"
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<combo>` | Modifier+key combo using `+` separator |

**Supported modifiers:** `cmd`/`command`, `shift`, `ctrl`/`control`, `alt`/`option`

#### ui mac scroll

Scroll in a direction within the app's focused window.

```bash
flowdeck ui mac scroll --direction down --app "Safari"
flowdeck ui mac scroll --direction up --amount 10 --app "MyApp"
flowdeck ui mac scroll --direction down --smooth --app "MyApp"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--direction <dir>` | `up`, `down`, `left`, or `right` (required) |
| `--amount <ticks>` | Scroll magnitude in discrete ticks (default: `3`) |
| `--smooth` | Smooth scrolling with many small ticks and delays |
| `--until <target>` | Scroll until element is visible (label or `id:identifier`) |
| `--timeout <seconds>` | Timeout for `--until` in seconds (default: `30`) |

**Notes:**
- Scrolling is performed at the center of the app's focused window. The cursor is moved to window center before each scroll event.
- `--amount` is discrete scroll wheel ticks, not pixels or fractions. Small values (1-10) produce subtle scrolls. For reaching off-screen content, prefer `--until "Element"` over guessing amounts.
- `--until` scrolls repeatedly at window center and checks the accessibility tree after each scroll. Use `id:myElement` to match by accessibility identifier. Note: `--until` still scrolls at window center, so the scrollable region must be under the center for this to work.

```bash
flowdeck ui mac scroll --direction down --app "Safari"
flowdeck ui mac scroll --direction down --until "id:bottomButton" --app "MyApp"
flowdeck ui mac scroll --direction down --until "Save" --timeout 15 --app "MyApp"
```

#### ui mac move

Move cursor to a screen point without clicking.

```bash
flowdeck ui mac move --point 500,300
flowdeck ui mac move --point 500,300 --app "MyApp"
```

#### ui mac drag

Drag from one point to another.

```bash
flowdeck ui mac drag --from 100,200 --to 400,500 --app "MyApp"
flowdeck ui mac drag --from 100,200 --to 400,500 --duration 1.0 --app "MyApp"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--from <x,y>` | Start point (screen-absolute) |
| `--to <x,y>` | End point (screen-absolute) |
| `--duration <seconds>` | Drag duration (default: `0.5`) |

#### ui mac swipe

Swipe in a direction from the window center.

```bash
flowdeck ui mac swipe --direction up --app "MyApp"
flowdeck ui mac swipe --direction left --distance 400 --app "MyApp"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--direction <dir>` | `up`, `down`, `left`, or `right` (required) |
| `--distance <points>` | Swipe distance in points (default: `200`) |
| `--duration <seconds>` | Swipe duration (default: `0.5`) |

#### ui mac find

Find an element in the accessibility tree.

```bash
flowdeck ui mac find "Settings" --app "MyApp"
flowdeck ui mac find "settings_button" --app "MyApp" --by-id
flowdeck ui mac find "button" --app "MyApp" --by-role
flowdeck ui mac find "Log" --app "MyApp" --contains
```

**Options:**
| Option | Description |
|--------|-------------|
| `<target>` | Element to find (label, ID, or role) |
| `--by-id` | Search by accessibility identifier |
| `--by-role` | Search by element role |
| `--contains` | Substring match against labels |

**Notes:**
- Returns element role, center coordinates (screen-absolute), enabled state, and text.
- Provides suggestions when no exact match is found.

#### ui mac list

List apps, windows, screens, or permissions.

```bash
flowdeck ui mac list apps --json
flowdeck ui mac list apps --include-agents --include-system
flowdeck ui mac list windows --app "Safari" --json
flowdeck ui mac list screens --json
flowdeck ui mac list permissions --json
```

**Arguments:**
| Argument | Description |
|----------|-------------|
| `<what>` | `apps`, `windows`, `screens`, or `permissions` |

**Options (apps):**
| Option | Description |
|--------|-------------|
| `--include-agents` | Include background agent apps |
| `--include-system` | Include system processes |

**Options (windows):**
| Option | Description |
|--------|-------------|
| `--app <name-or-bid-or-pid>` | Target app (required for windows) |

#### ui mac wait

Wait for an element condition.

```bash
flowdeck ui mac wait "Loading..." --app "MyApp"
flowdeck ui mac wait "Submit" --app "MyApp" --condition enabled --timeout 15
flowdeck ui mac wait "Toast" --app "MyApp" --condition gone
flowdeck ui mac wait "save_button" --app "MyApp" --by-id
```

**Options:**
| Option | Description |
|--------|-------------|
| `<target>` | Element to wait for |
| `--condition <cond>` | `exists` (default), `gone`, `enabled`, `stable` |
| `--timeout <seconds>` | Timeout in seconds (default: `30`) |
| `--by-id` | Treat target as accessibility identifier |

**Notes:**
- `--condition` is validated — invalid values produce an error with the list of valid conditions.

#### ui mac assert

Assert element conditions with immediate pass/fail (no polling).

```bash
flowdeck ui mac assert visible "Profile" --app "MyApp"
flowdeck ui mac assert hidden "Spinner" --app "MyApp"
flowdeck ui mac assert enabled "Submit" --app "MyApp"
flowdeck ui mac assert disabled "Continue" --app "MyApp"
flowdeck ui mac assert text "Welcome" --app "MyApp" --expected "Hello"
flowdeck ui mac assert text "title_label" --app "MyApp" --by-id --expected "Dashboard" --contains
```

**Subcommands:**
| Subcommand | Description |
|------------|-------------|
| `visible <target>` | Assert element is visible |
| `hidden <target>` | Assert element is hidden |
| `enabled <target>` | Assert element is enabled |
| `disabled <target>` | Assert element is disabled |
| `text <target>` | Assert element text matches `--expected` value |

**Common Options:**
| Option | Description |
|--------|-------------|
| `--by-id` | Treat target as accessibility identifier |
| `--app` | Target app |

**Text Options:**
| Option | Description |
|--------|-------------|
| `--expected <text>` | Expected text value (required) |
| `--contains` | Check whether text contains expected value |

#### ui mac launch

Launch an app by bundle ID.

```bash
flowdeck ui mac launch --bundle-id com.apple.Safari
```

#### ui mac activate

Bring a running app to the foreground.

```bash
flowdeck ui mac activate --app "Safari"
```

#### ui mac quit

Quit an app gracefully or forcefully.

```bash
flowdeck ui mac quit --app "TextEdit"
flowdeck ui mac quit --app "MyApp" --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `--force` | Force-terminate the app |

#### ui mac window

Window management subcommands.

```bash
flowdeck ui mac window list --app "Safari" --json
flowdeck ui mac window move --app "Safari" --to 100,100
flowdeck ui mac window resize --app "Safari" --size 1200,800
flowdeck ui mac window focus --app "Safari" --index 1
```

**Subcommands:**
| Subcommand | Description | Key Options |
|------------|-------------|-------------|
| `list` | List app windows | `--app` |
| `move` | Move a window | `--app`, `--to <x,y>`, `--index` |
| `resize` | Resize a window | `--app`, `--size <w,h>`, `--index` |
| `focus` | Focus a window | `--app`, `--index` |

#### ui mac menu

Menu bar interaction.

```bash
flowdeck ui mac menu list --app "TextEdit" --json
flowdeck ui mac menu click "File > Export as PDF" --app "TextEdit"
flowdeck ui mac menu click "Edit > Find > Find..." --app "Safari"
```

**Subcommands:**
| Subcommand | Description | Key Options |
|------------|-------------|-------------|
| `list` | List menu bar items and hierarchy | `--app` |
| `click` | Click a menu item by path (`>` separated) | `--app`, `<path>` |

#### UI Timing Tuning (macOS)

Same environment variables apply:

- `FLOWDECK_HID_STABILIZATION_MS` adds settle time between input events (default: `25`)
- `FLOWDECK_TYPE_DELAY_MS` adds per-character typing delay (default: `1`)

---
