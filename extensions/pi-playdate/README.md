![banner](https://assets.aliou.me/pi-extensions/banners/pi-playdate.png)

# pi-playdate

A pi extension for developing [Playdate](https://play.date) games. Provides typed tools for building, running, inspecting, and deploying Playdate projects in Lua and C.

## Install

```bash
pi install git:github.com/aliou/pi-playdate
```

## Quick Start

```
> Create a new Playdate game called "Bounce" in Lua
# Agent reads the playdate skill, creates Source/main.lua and Source/pdxinfo

> Build and run it
# Agent calls playdate_build then playdate_run_sim

> Take a screenshot so I can see it
# Agent calls playdate_screenshot, returns the image
```

## Tools

| Tool | Description |
|---|---|
| `playdate_doctor` | Check SDK installation, pdc, simulator, ARM toolchain, device |
| `playdate_build` | Compile Lua or C project to .pdx bundle |
| `playdate_build_release` | Compile Lua or C project to a release .pdx bundle (`pdc -s` for Lua) |
| `playdate_run_sim` | Launch the Playdate Simulator |
| `playdate_stop_sim` | Stop the running simulator |
| `playdate_sim_log` | Read recent simulator output from process logs and DAP console/output events |
| `playdate_screenshot` | Capture simulator screenshot (returned as image) |
| `playdate_sim_input` | Send D-pad/A/B/menu input to the simulator |
| `playdate_sim_crank` | Set simulator crank angle and dock state |
| `playdate_sim_accel` | Set simulator accelerometer values |
| `playdate_sim_state` | Read simulator hardware state (crank, accel, buttons, FPS, battery, time) |
| `playdate_sim_game_state` | Check the `__pi_state()` convention and dump structured game state |
| `playdate_sim_game_state_write` | Apply structured game state via `__pi_state_write()` using `patch` or `replace` |
| `playdate_sim_eval` | Evaluate Lua expressions in the running simulator |
| `playdate_device_log` | Read serial log output from a connected Playdate device |
| `playdate_run_device` | Deploy .pdx to a connected Playdate |
| `playdate_install_device` | Build, deploy, and launch a Playdate project on device |

## Commands

| Command | Description |
|---|---|
| `/playdate:doctor` | Check environment health |
| `/playdate:sim` | Build and run in simulator |
| `/playdate:device` | Build and deploy to device |
| `/playdate:settings` | Configure SDK path, build mode, etc. |

## Settings

Stored at `~/.pi/agent/extensions/playdate.json` (global) and `.pi/extensions/playdate.json` (project).

| Setting | Default | Description |
|---|---|---|
| `sdkPath` | `$PLAYDATE_SDK_PATH` | Override SDK path |
| `defaultTarget` | `"simulator"` | Default build target |
| `buildMode` | `"debug"` | C build mode |
| `armToolchainPath` | auto-detect | ARM toolchain for C device builds |
| `autoOpenSimulator` | `true` | Auto-open simulator after build |
| `simulatorLogLines` | `200` | Simulator log ring buffer size |

## Requirements

- [Playdate SDK](https://play.date/dev/) installed
- `PLAYDATE_SDK_PATH` environment variable set (or configured via settings)
- For C projects: `cmake`, `arm-none-eabi-gcc` (device builds)

## Runtime inspection and control

For common simulator loops, prefer the typed tools over generic eval:

- `playdate_sim_input` for D-pad / A / B / menu
- `playdate_sim_crank` for real crank position + dock state
- `playdate_sim_accel` for accelerometer values
- `playdate_sim_state` to confirm hardware state in one round-trip
- `playdate_sim_game_state` for stable structured game-state dumps via `__pi_state()`
- `playdate_sim_game_state_write` to apply structured state via `__pi_state_write()` with `patch` or `replace`
- `playdate_sim_log` for recent simulator/runtime output before falling back to deeper inspection
- `playdate_sim_eval` only for game-specific state or debugging

Game code can expose a global `__pi_state()` function that returns a plain Lua table. Then `playdate_sim_game_state` verifies the convention and dumps that table.

Games that support state injection can also expose `__pi_state_write(payload, mode)`. Then `playdate_sim_game_state_write` sends plain JSON-like data with `mode = "patch" | "replace"`.

`playdate_sim_log` reads the shared in-memory log ring buffer fed by simulator stdout/stderr and DAP output events when available. Use it early in crash/debug loops.

`playdate_sim_eval` still supports:

- bare expressions: auto-serialized, e.g. `playdate.readAccelerometer()` -> `(0.1, 0.2, 0.3)`
- `p <expr>` for raw values
- `eval <code>` for statements with captured `print()` output
- optional table-inspection controls for bare expressions:
  - `depth` to cap nesting
  - `start` to page through array-like tables
  - `keypath` to inspect a subtree like `cards.13`
  - `keysOnly` to inspect only table keys

Examples:

- `playdate_sim_eval(expression="__pi_state()", keysOnly=true)`
- `playdate_sim_eval(expression="__pi_state()", keypath="cards", start=13)`
- `playdate_sim_eval(expression="__pi_state()", keypath="cards.1", keysOnly=true)`

## Skill

The extension ships a `playdate` skill with reference docs for the Lua API, C API, CoreLibs, project layout, templates, performance tips, and common patterns. The agent loads these on demand when working on Playdate projects.

## Dev docs

These are implementation docs for extension contributors, not end-user usage docs:

- [docs/injected-dylib.md](docs/injected-dylib.md)
- [docs/simulator-control-protocol.md](docs/simulator-control-protocol.md)
- [docs/dap-protocol.md](docs/dap-protocol.md)
- [docs/lua-injections.md](docs/lua-injections.md)
- [docs/native-cli.md](docs/native-cli.md)
