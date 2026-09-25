# Playdate Performance Tips

The Playdate has limited hardware. Keep these constraints in mind.

## Hardware Specs

- CPU: 180 MHz Cortex-M7F (single core)
- RAM: 16 MB
- Display: 400x240, 1-bit (black and white), up to 50 FPS
- Storage: 4 GB flash

## General Guidelines

- Target 30 FPS (the default). Only use 50 FPS if the game is simple enough.
- The display is 1-bit. There are no grays -- use dithering patterns for shading.
- Minimize table/object allocations per frame. Lua GC pauses cause frame drops.
- Prefer `local` variables over globals. Local access is faster in Lua.
- Cache frequently accessed APIs: `local gfx <const> = playdate.graphics`.
- Use `<const>` for locals that never change -- the compiler can optimize them.

## Sprites

- Use the sprite system (`gfx.sprite`) instead of manual drawing when managing many objects.
- `gfx.sprite.update()` only redraws dirty regions, which is much faster than clearing and redrawing everything.
- Set `sprite:setRedrawsOnImageChange(false)` if you update the image every frame anyway.
- Remove off-screen sprites with `sprite:remove()` instead of leaving them in the display list.

## Drawing

- Avoid `gfx.image.new()` every frame. Create images once, reuse them.
- Draw to images off-screen with `gfx.pushContext(image)` / `gfx.popContext()`, then draw the image.
- Use image tables for animation frames instead of individual image files.
- `fillRect` and `drawRect` are fast. Complex paths and polygon fills are slower.

## Memory

- Use `playdate.simulator.getStats()` in the Simulator to check memory and CPU usage.
- Lua strings are immutable and interned. String concatenation in loops creates garbage.
- Use `table.concat()` instead of repeated `..` for building strings.

## C API

- C games have direct hardware access and no GC overhead.
- Mix C and Lua: use C for performance-critical paths, Lua for game logic.
- In hybrid projects, C code runs first, then Lua. Use `kEventInitLua` for Lua init.

## Profiling

- In the Simulator: use the built-in profiler (Playdate menu > Sampler).
- `playdate.drawFPS(x, y)` shows current framerate.
- `playdate.getElapsedTime()` / `playdate.resetElapsedTime()` for manual timing.
