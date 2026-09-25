# C Project Template

These templates come from the Playdate SDK's `C_API/Examples/Hello World/` directory.

## Required Files

### Source/pdxinfo

```
name=MyGame
author=Your Name
description=A C API game.
bundleID=com.yourname.mygame
version=1.0
buildNumber=1
imagePath=
```

### src/main.c

The SDK's Hello World example:

```c
#include <stdio.h>
#include <stdlib.h>

#include "pd_api.h"

static int update(void* userdata);
const char* fontpath = "/System/Fonts/Asheville-Sans-14-Bold.pft";
LCDFont* font = NULL;

#ifdef _WINDLL
__declspec(dllexport)
#endif
int eventHandler(PlaydateAPI* pd, PDSystemEvent event, uint32_t arg)
{
	(void)arg;

	if ( event == kEventInit )
	{
		const char* err;
		font = pd->graphics->loadFont(fontpath, &err);

		if ( font == NULL )
			pd->system->error("%s:%i Couldn't load font %s: %s", __FILE__, __LINE__, fontpath, err);

		pd->system->setUpdateCallback(update, pd);
	}

	return 0;
}

static int update(void* userdata)
{
	PlaydateAPI* pd = userdata;

	pd->graphics->clear(kColorWhite);
	pd->graphics->setFont(font);
	pd->graphics->drawText("Hello World!", strlen("Hello World!"), kASCIIEncoding, 10, 10);

	pd->system->drawFPS(0, 0);

	return 1;
}
```

Key points:
- `eventHandler` is the entry point. It receives lifecycle events via `PDSystemEvent`.
- `kEventInit` fires once at startup. Register the update callback here.
- The update function returns 1 to tell the system the display was updated.
- `pd_api.h` is provided by the SDK's `C_API/` directory. The CMake include handles the include path.
- The `#ifdef _WINDLL` block is needed for Windows DLL builds.

### CMakeLists.txt

From the SDK's Hello World example:

```cmake
cmake_minimum_required(VERSION 3.14)
set(CMAKE_C_STANDARD 11)

set(ENVSDK $ENV{PLAYDATE_SDK_PATH})

if (NOT ${ENVSDK} STREQUAL "")
	# Convert path from Windows
	file(TO_CMAKE_PATH ${ENVSDK} SDK)
else()
	execute_process(
			COMMAND bash -c "egrep '^\\s*SDKRoot' $HOME/.Playdate/config"
			COMMAND head -n 1
			COMMAND cut -c9-
			OUTPUT_VARIABLE SDK
			OUTPUT_STRIP_TRAILING_WHITESPACE
	)
endif()

if (NOT EXISTS ${SDK})
	message(FATAL_ERROR "SDK Path not found; set ENV value PLAYDATE_SDK_PATH")
	return()
endif()

set(CMAKE_CONFIGURATION_TYPES "Debug;Release")
set(CMAKE_XCODE_GENERATE_SCHEME TRUE)

# Game Name Customization
set(PLAYDATE_GAME_NAME MyGame)
set(PLAYDATE_GAME_DEVICE MyGame_DEVICE)

project(${PLAYDATE_GAME_NAME} C ASM)

if (TOOLCHAIN STREQUAL "armgcc")
	add_executable(${PLAYDATE_GAME_DEVICE} src/main.c)
else()
	add_library(${PLAYDATE_GAME_NAME} SHARED src/main.c)
endif()

include(${SDK}/C_API/buildsupport/playdate_game.cmake)
```

Replace `MyGame` in `PLAYDATE_GAME_NAME` and `PLAYDATE_GAME_DEVICE` with the actual project name.

For multiple source files, list them all in the `add_executable` / `add_library` calls, or use `file(GLOB ...)`.

## Directory Structure

```
MyGame/
  src/
    main.c
  Source/
    pdxinfo
    images/        (optional, copied into .pdx)
  CMakeLists.txt
  build/           (created during build)
```

## Build Targets

- **Simulator**: `cmake -B build . && cmake --build build` -- uses host compiler, produces a shared library.
- **Device**: `cmake -B build-device -DCMAKE_TOOLCHAIN_FILE=$PLAYDATE_SDK_PATH/C_API/buildsupport/arm.cmake . && cmake --build build-device` -- uses ARM cross-compiler.

Run `playdate_doctor` to check if the ARM toolchain is available.
