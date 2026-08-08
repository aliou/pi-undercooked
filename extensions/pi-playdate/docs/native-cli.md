# Native CLI and build flow

This document describes the small native toolchain used for runtime simulator control.

## Artifacts

Source:

- `native/playdate-simctl.swift`
- `native/playdate-sim-agent.c`

Built artifacts:

- `bin/playdate-simctl`
- `bin/playdate-sim-agent.dylib`

Build script:

- `scripts/build-native-tools.sh`

## Responsibilities

### `playdate-simctl`

The Swift CLI is the bridge between TypeScript and the injected dylib.

It is responsible for:

- argument parsing
- one-time injection bootstrap through LLDB + `dlopen()`
- socket connection setup
- JSON request/response handling
- JSON stdout for the TS layer

### `playdate-sim-agent.dylib`

The dylib lives inside the simulator process and is responsible for:

- opening the Unix socket server
- parsing tiny JSON commands
- calling internal simulator functions
- making those calls on the main thread

## Why build outside Nix shell

This project intentionally uses system compilers for the native artifacts:

- `/usr/bin/swiftc`
- `/usr/bin/clang`

`scripts/build-native-tools.sh` runs them through `env -i` with a clean PATH.

This mirrors the existing `pi-harness` pattern and avoids problems from accidentally picking Nix-store Swift/clang binaries.

## Why a CLI instead of direct FFI

The TS layer only needs a small command surface and JSON results. A CLI keeps the boundary simple:

- no Node native addon
- no N-API surface
- no TS-level socket parsing
- easy to test from a shell when debugging

## Current command surface

```text
playdate-simctl inject --pid <pid>
playdate-simctl crank-set --pid <pid> --angle <degrees> [--docked true|false]
playdate-simctl crank-dock --pid <pid> --docked true|false
playdate-simctl accel-set --pid <pid> --x <n> --y <n> --z <n>
playdate-simctl menu-open --pid <pid>
```

## TS entry point

TypeScript uses `src/lib/sim-control.ts` to call the CLI through `pi.exec()`.

That file is the only place extension code should know about the CLI path or CLI arguments.
