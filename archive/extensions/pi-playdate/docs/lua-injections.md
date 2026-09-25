# Lua injections

This document describes the Lua code injected into the simulator DAP REPL.

## Why we inject Lua

The Playdate DAP REPL can evaluate Lua, but raw results are not ergonomic enough on their own.

We inject helpers to make:

- safer value serialization available in one call
- multi-return expressions readable
- common hardware state available in one call

## Files

- `lua/ad.lua` -- extension-specific debug helper module

This file is read by `src/lib/dap.ts` and evaluated after DAP connect.

## Helper functions

### `ad.dump(...)`

Varargs-safe serializer.

Why it exists:

Many Playdate APIs, like `playdate.readAccelerometer()`, return multiple values. We also need a returned string, not console output, so `printTable()` is not enough.

`ad.dump(...)` adapts that with a small custom serializer:

- zero returns -> `"nil"`
- one return -> Lua-like string output for plain values and tables
- multiple returns -> `(v1, v2, ...)`
- cycles -> `<cycle>`
- deep nesting past the cap -> `<max-depth>`
- large tables past the item cap -> `<truncated>`

That is why bare `playdate_sim_eval` expressions can show:

```text
(0.1, 0.2, 0.3)
```

### `ad.inspect(value, opts)`

Safer table inspection helper used by `playdate_sim_eval` for bare expressions.

Supported options:

- `depth` -- maximum nested table depth
- `start` -- 1-based start index for array-like tables
- `keypath` -- dot-separated subpath like `cards.13`
- `keysOnly` -- return only keys for the selected table

This lets agents inspect large state incrementally instead of forcing one huge dump.

### `ad.state()`

Returns a compact `key=value|...` string containing common hardware/runtime state:

- crank position / change / docked
- accelerometer x / y / z
- button pressed state
- fps
- elapsed time
- current time ms
- battery percentage

`playdate_sim_state` parses this into structured JSON details.

## Eval ergonomics

`playdate_sim_eval` normalizes user input before sending it to DAP:

- bare expression -> wrapped in `p ad.inspect(...)`
- `p <expr>` -> passed through raw
- `eval <code>` -> wrapped in a single-chunk print-capture expression

Bare-expression dumps support:

- `depth`
- `start`
- `keypath`
- `keysOnly`

## Why print capture is not in ad.lua

Playdate's REPL binds `print` per evaluated chunk. A helper function defined in one eval call cannot reliably intercept `print()` from another later eval call.

So print capture is generated inline in `src/tools/sim_eval.ts` as a one-off wrapped expression, where the `print` override and the user code run in the same chunk.
