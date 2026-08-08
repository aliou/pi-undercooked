# Simulator control protocol

This document describes the IPC protocol between `playdate-simctl` and the injected `playdate-sim-agent.dylib`.

## Transport

- Unix domain socket
- Path: `/tmp/pi-playdate-agent-<pid>.sock`
- One request per line
- One JSON response per line

The socket server lives inside the simulator process.

## Why a socket

We needed something simple, low-latency, and process-local after injection. A Unix socket is enough for one-shot command/response control.

## Request format

Each request is a single-line JSON object.

Examples:

```json
{"action":"ping"}
{"action":"crankDock","docked":false}
{"action":"crankSet","angle":180,"docked":false}
{"action":"accelSet","x":0.1,"y":0.2,"z":0.3}
{"action":"menuOpen"}
```

## Response format

Successful responses:

```json
{"ok":true,"action":"ping"}
{"ok":true,"action":"crankDock","docked":false}
{"ok":true,"action":"crankSet","angle":180,"docked":false}
{"ok":true,"action":"accelSet","x":0.1,"y":0.2,"z":0.3}
{"ok":true,"action":"menuOpen"}
```

Error response:

```json
{"ok":false,"error":"unknown action"}
```

## CLI behavior

`playdate-simctl` does three things:

1. Parse CLI args into a command.
2. Ensure the agent is loaded.
3. Send JSON to the socket and print JSON to stdout.

The CLI is intentionally tiny. It is not a long-lived daemon.

## TS boundary

TypeScript never talks to the socket directly. It goes through:

- `src/lib/sim-control.ts`
- `bin/playdate-simctl`

That keeps the extension side simple and lets native details stay isolated in the CLI and dylib.

## Current commands

- `inject`
- `crank-set`
- `crank-dock`
- `accel-set`
- `menu-open`

## Notes

- First call per simulator PID may pay the one-time injection cost.
- After injection, calls are typically around 10ms.
- Socket protocol is intentionally narrow. Add commands only when there is a real tool-level need.
