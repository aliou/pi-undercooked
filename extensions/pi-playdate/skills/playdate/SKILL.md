---
name: playdate
description: Develop games for the Panic Playdate handheld using the pi-playdate extension. Use when the user wants to create, build, run, or debug a Playdate game in Lua or C, work with .pdx bundles, run the Simulator, take screenshots of a running game, or deploy to a connected Playdate device over USB.
---

# Playdate Development

This skill teaches you how to develop games for the Panic Playdate using the `pi-playdate` extension. All Playdate operations go through the `playdate_*` tools -- never shell out to `pdc`, `pdutil`, `cmake`, or any SDK binary directly.

## Available Tools

| Tool | Purpose |
|---|---|
| `playdate_doctor` | Check SDK installation and environment health |
| `playdate_build` | Compile project to .pdx bundle |
| `playdate_run_sim` | Launch the Playdate Simulator |
| `playdate_stop_sim` | Stop the running simulator |
| `playdate_sim_log` | Read recent simulator output from process logs and DAP console/output events |
| `playdate_screenshot` | Capture simulator screenshot |
| `playdate_sim_input` | Send D-pad/A/B/menu input to the simulator |
| `playdate_sim_crank` | Set simulator crank angle and dock state |
| `playdate_sim_accel` | Set simulator accelerometer values |
| `playdate_sim_state` | Read simulator hardware state in one call |
| `playdate_sim_game_state` | Check the `__pi_state()` convention and dump structured game state |
| `playdate_sim_game_state_write` | Apply structured game state via `__pi_state_write()` using `patch` or `replace` |
| `playdate_sim_eval` | Evaluate Lua in the running simulator (game-specific state, debugging) |
| `playdate_run_device` | Deploy to a connected Playdate device |

## Creating a New Project

There is no scaffolding tool. Create project files directly using `write`.

Read the appropriate template reference before creating:

- **Lua project**: Read [references/templates-lua.md](references/templates-lua.md) for the required files and their contents.
- **C project**: Read [references/templates-c.md](references/templates-c.md) for the required files, CMakeLists.txt setup, and C API boilerplate.

Every project needs a `Source/pdxinfo` file. See [references/project-layout.md](references/project-layout.md) for the format.

## Typical Workflows

### New game (Lua)

1. Read `references/templates-lua.md`
2. Create `Source/main.lua` and `Source/pdxinfo` using `write`
3. `playdate_build`
4. `playdate_run_sim`
5. `playdate_screenshot` to check visuals
6. `playdate_sim_input` to interact with the game (D-pad, A, B buttons)
7. Edit code, rebuild, repeat

### New game (C)

1. Read `references/templates-c.md`
2. Create `src/main.c`, `Source/pdxinfo`, and `CMakeLists.txt` using `write`
3. `playdate_build` (auto-detects C project and uses CMake)
4. `playdate_run_sim`

### Debug loop

1. `playdate_build` -- check `details.errors` for issues
2. If errors, fix the source files and rebuild
3. `playdate_run_sim` to test
4. `playdate_sim_log` to check runtime output before deeper inspection
5. `playdate_screenshot` to verify visuals
6. `playdate_sim_state` to inspect hardware state at runtime
7. `playdate_sim_eval` only for game-specific state or debugging
8. Iterate

### Deploy to device

1. `playdate_build` with target "device"
2. `playdate_run_device` (always prompts user for confirmation)

### Interacting with a running game

1. `playdate_sim_input` sends button input directly to the Lua game
2. `playdate_screenshot` reads the current display (clean 400x240, no chrome)
3. `playdate_sim_state` reads common hardware state at runtime
4. `playdate_sim_game_state` reads structured game state via `__pi_state()`
5. `playdate_sim_game_state_write` applies structured state via `__pi_state_write()`
6. `playdate_sim_eval` reads or modifies game-specific state at runtime

`playdate_sim_input` supports these buttons: `up`, `down`, `left`, `right`, `a`, `b`, `menu`.

`playdate_sim_input` supports these actions:
- `press` -- tap a button once
- `hold` -- press and briefly hold a button
- `release` -- release a held button

Use `repeat` with `playdate_sim_input` for repeated taps, such as moving a cursor several cells.

`playdate_sim_input`, `playdate_screenshot`, and `playdate_sim_eval` all require DAP (Debug Adapter Protocol). DAP connects automatically when the simulator starts a Lua game. These tools only work with Lua games -- C games do not support DAP.

### Playing a game autonomously

For visual play:

1. Use `playdate_screenshot` to read the current screen
2. Decide the next move
3. Use `playdate_sim_input` to send that move
4. Use `playdate_screenshot` again to verify the result
5. Repeat until the game ends

For state-driven play without vision:

1. Use `playdate_sim_state` to inspect common hardware state
2. Use `playdate_sim_eval` only if you need game-specific state
3. Decide the next move from the returned values
4. Use `playdate_sim_input` to send that move
5. Use `playdate_sim_state` again to confirm the new state
6. Repeat until the game ends

Common `playdate_sim_input` examples:
- move cursor right: `button: "right"`
- move cursor down twice: `button: "down", repeat: 2`
- confirm/select: `button: "a"`
- cancel/back: `button: "b"`
- open menu: `button: "menu"`

### Reading game state without vision

For models without vision or when you need structured data:

- Use `playdate_sim_state` for hardware values like crank, accelerometer, pressed buttons, FPS, battery, and elapsed time
- Use `playdate_sim_eval` with a bare expression for inspected values: `score`, `_G.game.board`, `playdate.readAccelerometer()`
- Use `playdate_sim_eval` with `p <expression>` only when you want the raw DAP value
- `ad` is injected automatically by the extension, and bare expressions are wrapped in `ad.inspect(...)`

For large tables, prefer narrower reads over one giant dump:

- `depth` limits nested table expansion
- `start` pages through array-like tables
- `keypath` inspects a subtree like `cards.13`
- `keysOnly` lists available keys without dumping values

Examples:

- `playdate_sim_eval(expression="__pi_state()", keysOnly=true)`
- `playdate_sim_eval(expression="__pi_state()", keypath="cards", start=13)`
- `playdate_sim_eval(expression="__pi_state()", keypath="cards.1", keysOnly=true)`

For stable structured game-state access, expose a global `__pi_state()` function:

```lua
function __pi_state()
  return {
    version = 1,
    board = board,
    cursor = { x = cursorX, y = cursorY },
    currentPlayer = currentPlayer,
    gameOver = gameOver,
    score = score,
  }
end
```

If the game should support agent-driven state injection, also expose `__pi_state_write(payload, mode)`:

```lua
function __pi_state_write(payload, mode)
  -- mode is "patch" or "replace"
  -- validate payload, apply it to the live game, then return a plain table
  return { ok = true, version = 1 }
end
```

Convention rules:

- `__pi_state()` must take no arguments and return a Lua table
- `__pi_state_write(payload, mode)` should accept `mode = "patch" | "replace"`
- `patch` should deep-merge into the current external state
- `replace` should replace the full external state
- Deep merge should recurse only through map-like tables; array-like tables should be replaced whole
- Keep values simple: numbers, strings, booleans, and nested tables
- Do not return or accept userdata, functions, images, sprites, or other opaque objects
- Include a top-level `version` and reject unsupported versions in `__pi_state_write()`
- Keep the external shape stable across frames when possible

Then:
- read with `playdate_sim_game_state`
- write with `playdate_sim_game_state_write`

Use `playdate_sim_eval` for one-off debugging beyond that contract.

Note: Lua `local` variables are not directly accessible via `playdate_sim_eval`. Only globals and values reachable from globals can be read. When writing game code, expose any state the agent needs to inspect or apply through `__pi_state()` / `__pi_state_write()` or another global you intentionally debug with `playdate_sim_eval`.

## Environment Setup

Run `playdate_doctor` first to verify the SDK is installed and configured. If the SDK path is not auto-detected, the user can set it via `/playdate:settings`.

## Reference Files

For API details, read the reference files in this skill's `references/` directory:

- `project-layout.md` -- Playdate project structure and pdxinfo format
- `templates-lua.md` -- Lua project template with minimal playdate.update()
- `templates-c.md` -- C project template with CMakeLists.txt and event handler
- `lua-api.md` -- Lua API quick reference
- `c-api.md` -- C API quick reference
- `corelibs.md` -- Standard Lua libraries (sprites, graphics, timers, etc.)
- `performance.md` -- Performance tips for the Playdate hardware
- `patterns.md` -- Common game patterns and idioms

## DAP (Debug Adapter Protocol)

The Playdate Simulator exposes a DAP server on TCP port 55934 for Lua games. The extension connects automatically after `playdate_run_sim`. DAP enables:

- Evaluating Lua expressions (`playdate_sim_eval`)
- Reading common hardware state in one call (`playdate_sim_state`)
- Reading structured game state via `__pi_state()` (`playdate_sim_game_state`)
- Writing structured game state via `__pi_state_write()` (`playdate_sim_game_state_write`)
- Clean screenshots via `playdate.simulator.writeToFile()` (`playdate_screenshot`)
- Direct button callbacks instead of OS keyboard simulation (`playdate_sim_input`)
- Output-event capture into `playdate_sim_log` when the simulator emits DAP console/output events
- Injected `ad` debug module for serialization, subtree inspection, and nicer eval output

DAP is only available for Lua games. C games can still be built and run, but interactive tools (screenshot, input, eval) require DAP and will not work.
