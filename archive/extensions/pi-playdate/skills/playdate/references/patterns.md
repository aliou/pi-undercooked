# Common Playdate Game Patterns

## Game Loop with State

```lua
local gfx = playdate.graphics

local state = "title"  -- "title", "playing", "gameover"

function playdate.update()
    if state == "title" then
        updateTitle()
    elseif state == "playing" then
        updateGame()
    elseif state == "gameover" then
        updateGameOver()
    end
end

function updateTitle()
    gfx.clear(gfx.kColorWhite)
    gfx.drawTextAligned("Press A to Start", 200, 120, kTextAlignment.center)
    if playdate.buttonJustPressed(playdate.kButtonA) then
        state = "playing"
    end
end
```

## Sprite-Based Game Object

```lua
import "CoreLibs/object"
import "CoreLibs/sprites"

local gfx = playdate.graphics

class("Player").extends(gfx.sprite)

function Player:init(x, y)
    local img = gfx.image.new("images/player")
    Player.super.init(self, img)
    self:moveTo(x, y)
    self:setCollideRect(0, 0, self:getSize())
    self:add()
end

function Player:update()
    local dx, dy = 0, 0
    if playdate.buttonIsPressed(playdate.kButtonLeft) then dx = -2 end
    if playdate.buttonIsPressed(playdate.kButtonRight) then dx = 2 end
    if playdate.buttonIsPressed(playdate.kButtonUp) then dy = -2 end
    if playdate.buttonIsPressed(playdate.kButtonDown) then dy = 2 end

    self:moveWithCollisions(self.x + dx, self.y + dy)
end
```

## Crank Input

```lua
function playdate.update()
    local change = playdate.getCrankChange()
    if change ~= 0 then
        -- Rotate, scroll, or adjust a value
        angle = angle + change
    end
end

-- Show crank indicator when docked
function playdate.update()
    if playdate.isCrankDocked() then
        playdate.ui.crankIndicator:draw()
    end
end
```

## Screen Transitions

```lua
local gfx = playdate.graphics

local transitionTimer = nil

function startTransition(callback)
    transitionTimer = playdate.timer.new(300, 0, 400, playdate.easingFunctions.inOutQuad)
    transitionTimer.timerEndedCallback = function()
        callback()
        transitionTimer = playdate.timer.new(300, 400, 0, playdate.easingFunctions.inOutQuad)
    end
end

function playdate.update()
    -- normal game drawing here

    if transitionTimer then
        gfx.setColor(gfx.kColorBlack)
        gfx.fillRect(0, 0, transitionTimer.value, 240)
    end

    playdate.timer.updateTimers()
end
```

## Menu Items

```lua
local menu = playdate.getSystemMenu()

menu:addMenuItem("Restart", function()
    restartGame()
end)

menu:addCheckmarkMenuItem("Sound", true, function(checked)
    soundEnabled = checked
end)
```

## Save / Load

```lua
function saveGame()
    playdate.datastore.write({ score = score, level = level })
end

function loadGame()
    local data = playdate.datastore.read()
    if data then
        score = data.score or 0
        level = data.level or 1
    end
end
```

## Agent-visible State Dump

```lua
function __pi_state()
    return {
        version = 1,
        score = score,
        level = level,
        player = {
            x = playerX,
            y = playerY,
        },
        gameOver = gameOver,
    }
end
```

Keep `__pi_state()` stable and boring. Return plain Lua data only.

## Agent-visible State Write

```lua
local function deepMerge(dst, src)
    for k, v in pairs(src) do
        if type(dst[k]) == "table" and type(v) == "table" and #dst[k] == 0 and #v == 0 then
            deepMerge(dst[k], v)
        else
            dst[k] = v
        end
    end
    return dst
end

function __pi_state_write(payload, mode)
    local current = __pi_state()
    local nextState = mode == "patch" and deepMerge(current, payload) or payload

    -- validate nextState here
    score = nextState.score
    level = nextState.level
    playerX = nextState.player.x
    playerY = nextState.player.y
    gameOver = nextState.gameOver

    return { ok = true, version = 1 }
end
```

Prefer validating and applying through real game fields or methods instead of mutating random globals.

## Animation with Image Tables

```lua
import "CoreLibs/animation"

local gfx = playdate.graphics

local walkTable = gfx.imagetable.new("images/walk")
local walkLoop = gfx.animation.loop.new(100, walkTable, true)  -- 100ms per frame, loop

function playdate.update()
    walkLoop:draw(playerX, playerY)
end
```
