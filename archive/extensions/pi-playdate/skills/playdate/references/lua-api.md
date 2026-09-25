# Playdate Lua API Quick Reference

## Entry Points

```lua
-- Required: called every frame (~30fps by default)
function playdate.update()
end

-- Optional lifecycle callbacks
function playdate.gameWillTerminate() end
function playdate.deviceWillSleep() end
function playdate.deviceWillLock() end
function playdate.deviceDidUnlock() end
function playdate.gameWillPause() end
function playdate.gameWillResume() end
```

## Graphics (playdate.graphics / gfx)

```lua
local gfx <const> = playdate.graphics

gfx.clear(gfx.kColorWhite)
gfx.drawText("Hello", x, y)
gfx.drawRect(x, y, w, h)
gfx.fillRect(x, y, w, h)
gfx.drawCircleAtPoint(x, y, r)
gfx.drawLine(x1, y1, x2, y2)
gfx.setColor(gfx.kColorBlack)

-- Images
local img = gfx.image.new("images/player")
img:draw(x, y)
img:drawCentered(x, y)

-- Image tables (animation frames)
local imgTable = gfx.imagetable.new("images/walk")
imgTable:getImage(frameIndex)

-- Fonts
local font = gfx.font.new("fonts/myfont")
gfx.setFont(font)

-- Sprite system (preferred for game objects)
local sprite = gfx.sprite.new(image)
sprite:moveTo(x, y)
sprite:add()        -- add to display list
sprite:remove()     -- remove from display list

-- Call in update() to draw all sprites
gfx.sprite.update()
```

## Input

```lua
-- Button state
playdate.buttonIsPressed(playdate.kButtonA)
playdate.buttonIsPressed(playdate.kButtonB)
playdate.buttonIsPressed(playdate.kButtonUp)
playdate.buttonIsPressed(playdate.kButtonDown)
playdate.buttonIsPressed(playdate.kButtonLeft)
playdate.buttonIsPressed(playdate.kButtonRight)

-- Just pressed/released this frame
playdate.buttonJustPressed(playdate.kButtonA)
playdate.buttonJustReleased(playdate.kButtonA)

-- Crank
local change, accelerated = playdate.getCrankChange()
local angle = playdate.getCrankPosition()  -- 0-360 degrees
local docked = playdate.isCrankDocked()
```

## Display

```lua
playdate.display.setRefreshRate(30)  -- default 30fps, max 50fps
playdate.display.getWidth()   -- 400
playdate.display.getHeight()  -- 240
playdate.display.setInverted(true)
playdate.display.setScale(2)  -- pixel doubling
```

## Sound

```lua
local player = playdate.sound.fileplayer.new("sounds/music")
player:play(repeatCount)  -- 0 = loop forever
player:stop()
player:setVolume(0.5)

local sfx = playdate.sound.sampleplayer.new("sounds/beep")
sfx:play(1)

-- Synths
local synth = playdate.sound.synth.new(playdate.sound.kWaveSine)
synth:playNote(440, 0.5, 1.0)  -- freq, volume, duration
```

## Timers

```lua
import "CoreLibs/timer"

-- Call in update()
playdate.timer.updateTimers()

-- One-shot timer
local t = playdate.timer.new(1000, function() print("done") end)

-- Value timer (tween)
local t = playdate.timer.new(500, 0, 100)  -- 500ms, 0 to 100
-- Read t.value each frame
```

## Data / Save

```lua
playdate.datastore.write({ score = 100 }, "save")
local data = playdate.datastore.read("save")
```

## System

```lua
playdate.getTime()           -- { year, month, day, hour, minute, second, millisecond }
playdate.getCurrentTimeMilliseconds()
playdate.getElapsedTime()    -- seconds since last resetElapsedTime()
playdate.resetElapsedTime()
```

Full API: https://sdk.play.date/Inside%20Playdate%20with%20Lua.html
