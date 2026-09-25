# Playdate CoreLibs Reference

CoreLibs are standard Lua libraries shipped with the SDK at `$PLAYDATE_SDK_PATH/CoreLibs/`. Import them with `import "CoreLibs/<name>"`.

## Available Libraries

| Import | File | Purpose |
|---|---|---|
| `CoreLibs/object` | object.lua | OOP helpers: class(), subclass, super |
| `CoreLibs/graphics` | graphics.lua | Extended drawing: rounded rects, arcs, text alignment |
| `CoreLibs/sprites` | sprites.lua | Sprite system with collision detection |
| `CoreLibs/timer` | timer.lua | One-shot and repeating timers, value tweens |
| `CoreLibs/frameTimer` | frameTimer.lua | Frame-based timers (not wall-clock) |
| `CoreLibs/animator` | animator.lua | Property animation with easing |
| `CoreLibs/animation` | animation.lua | Sprite animation (image table playback) |
| `CoreLibs/crank` | crank.lua | Crank utilities, sounds, indicators |
| `CoreLibs/easing` | easing.lua | Easing functions (linear, quad, cubic, etc.) |
| `CoreLibs/ui` | ui.lua | Grid view, crank indicator UI |
| `CoreLibs/keyboard` | keyboard.lua | On-screen keyboard |
| `CoreLibs/math` | math.lua | Math helpers |
| `CoreLibs/string` | string.lua | String utilities |
| `CoreLibs/nineslice` | nineslice.lua | Nine-slice image scaling |
| `CoreLibs/qrcode` | qrcode.lua | QR code generation |
| `CoreLibs/strict` | strict.lua | Catches undefined global access (debugging) |
| `CoreLibs/save` | save.lua | Save/load game data helpers |

## Sprites (CoreLibs/sprites)

The sprite system is the recommended way to manage game objects.

```lua
import "CoreLibs/sprites"

local gfx = playdate.graphics

-- Create a sprite
local playerImage = gfx.image.new("images/player")
local player = gfx.sprite.new(playerImage)
player:moveTo(200, 120)
player:add()  -- add to the display list

-- In update():
function playdate.update()
    gfx.sprite.update()  -- draws all sprites
end

-- Collision
player:setCollideRect(0, 0, player:getSize())
player:setTag(1)  -- for identifying sprite types

-- Move with collision
local actualX, actualY, collisions, length = player:moveWithCollisions(targetX, targetY)
for i = 1, length do
    local collision = collisions[i]
    -- collision.other, collision.type, collision.normal, collision.touch, collision.slide
end
```

## Timers (CoreLibs/timer)

```lua
import "CoreLibs/timer"

-- Must call in update():
function playdate.update()
    playdate.timer.updateTimers()
end

-- Callback timer
playdate.timer.performAfterDelay(1000, function()
    print("1 second later")
end)

-- Value timer (tween)
local t = playdate.timer.new(500, 0, 100)  -- 500ms, from 0 to 100
-- Read t.value each frame

-- Repeating timer
local t = playdate.timer.new(1000, callback)
t.repeats = true
```

## Object System (CoreLibs/object)

```lua
import "CoreLibs/object"

class("MyClass").extends()

function MyClass:init(x, y)
    MyClass.super.init(self)
    self.x = x
    self.y = y
end

-- Subclass from sprite
class("Player").extends(playdate.graphics.sprite)

function Player:init(image)
    Player.super.init(self, image)
end
```

Full details: https://sdk.play.date/Inside%20Playdate.html
