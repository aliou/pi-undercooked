# Playdate Project Layout

## Lua Project

Based on the SDK's `Examples/Game Template/`:

```
MyGame/
  Source/
    main.lua        # Entry point. Must define playdate.update()
    pdxinfo         # Project metadata (required)
    images/         # Image assets (.png, compiled to .pdi by pdc)
    sounds/         # Audio assets (.wav, .mp3)
  MyGame.pdx/       # Compiled output (created by pdc)
```

## C Project

Based on the SDK's `C_API/Examples/Hello World/`:

```
MyGame/
  src/
    main.c          # Entry point. Must define eventHandler()
  Source/
    pdxinfo         # Project metadata (required)
    images/         # Assets copied into .pdx
  CMakeLists.txt    # Build config referencing playdate_game.cmake
  build/            # Build output (created by cmake)
```

## pdxinfo Format

Plain text key=value file. From the SDK docs:

```
name=b360
author=Panic Inc.
description=When all you have is a ton of bricks, everything looks like a paddle.
bundleID=com.panic.b360
version=1.0
buildNumber=123
imagePath=path/to/launcher/assets
launchSoundPath=path/to/launch/sound/file
contentWarning=This game contains mild realistic violence and bloodshed.
contentWarning2=This game contains flashing content that may not be suitable for photosensitive epilepsy.
```

Required fields: `name`, `bundleID`. Everything else is optional but recommended.

`imagePath` points to a directory containing launcher card images:
- `card.png` (350x155) -- shown in the launcher
- `icon.png` (32x32) -- shown in the system menu

`buildNumber` should be incremented for every public release.

## .pdx Bundle

The compiled game bundle. This is what the Simulator and device run.

- Created by `pdc` (Lua) or CMake + pdc (C)
- It is a directory on disk, not a single file
- Contains compiled bytecode (.pdz for Lua), compiled images (.pdi), and other assets
- Deployed to `PLAYDATE/Games/` on the device data disk

## Key SDK Paths

| Path | Description |
|---|---|
| `$PLAYDATE_SDK_PATH/bin/pdc` | Playdate compiler |
| `$PLAYDATE_SDK_PATH/bin/pdutil` | Device utility |
| `$PLAYDATE_SDK_PATH/bin/Playdate Simulator.app` | macOS simulator |
| `$PLAYDATE_SDK_PATH/CoreLibs/` | Standard Lua libraries |
| `$PLAYDATE_SDK_PATH/Examples/` | Lua example projects |
| `$PLAYDATE_SDK_PATH/C_API/pd_api.h` | C API header |
| `$PLAYDATE_SDK_PATH/C_API/Examples/` | C example projects |
| `$PLAYDATE_SDK_PATH/C_API/buildsupport/playdate_game.cmake` | CMake include for C builds |
| `$PLAYDATE_SDK_PATH/C_API/buildsupport/arm.cmake` | ARM cross-compile toolchain file |

Full docs: https://sdk.play.date/Inside%20Playdate.html
