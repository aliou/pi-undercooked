# Lua Project Template

These templates come from the Playdate SDK's `Examples/Game Template/` directory.

## Required Files

### Source/pdxinfo

```
name=MyGame
author=Your Name
description=A basic game.
bundleID=com.yourname.mygame
version=1.0
buildNumber=1
imagePath=
```

Replace `MyGame`, author, description, and `bundleID` with actual values. `imagePath` points to a directory with launcher card images (optional).

### Source/main.lua

The SDK's official Game Template:

```lua
local gfx = playdate.graphics

gfx.setColor(gfx.kColorBlack)

function playdate.update()
    gfx.fillRect(0, 0, 400, 240)
    playdate.drawFPS(0,0)
end
```

Notes:
- `playdate.update()` is required. It is called every frame (default 30 FPS).
- No `import` statements are needed for the base SDK. Use `import "CoreLibs/sprites"` etc. only when using those libraries.
- `playdate.drawFPS(x,y)` is a debug helper -- remove it for release builds.

## Agent-visible game state convention

If the agent will need stable structured game-state reads, add a global `__pi_state()` function from the start:

```lua
function __pi_state()
    return {
        version = 1,
        -- add game state here
    }
end
```

Rules:
- Name must be exactly `__pi_state`
- Takes no arguments
- Returns a Lua table
- Keep values simple: numbers, strings, booleans, nil, and nested tables
- Do not return userdata, functions, images, sprites, or other opaque objects

The agent can then call `playdate_sim_game_state` to verify the convention and dump the state.

If the game should also support loading or editing state, add a matching writer:

```lua
function __pi_state_write(payload, mode)
    -- mode is "patch" or "replace"
    -- validate and apply payload here
    return { ok = true, version = 1 }
end
```

Recommended semantics:
- `replace` uses `payload` as the full next external state
- `patch` deep-merges `payload` into the current external state first
- recurse only through map-like tables
- replace array-like tables whole
- reject unsupported `version` values

## Common imports

Add these only when you need the functionality:

```lua
import "CoreLibs/object"      -- OOP helpers
import "CoreLibs/graphics"    -- extended drawing functions
import "CoreLibs/sprites"     -- sprite system
import "CoreLibs/timer"       -- timers and tweens
import "CoreLibs/crank"       -- crank utilities
import "CoreLibs/animator"    -- animation helpers
import "CoreLibs/ui"          -- grid view, crank indicator
```

## Directory Structure

```
MyGame/
  Source/
    main.lua
    pdxinfo
    images/        (optional, .png files compiled to .pdi by pdc)
    sounds/        (optional, .wav/.mp3 files)
```

After building with `playdate_build`, the output is `MyGame.pdx/` in the project root.
