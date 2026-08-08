# pi-playdate

Pi extension for Playdate game development. Wraps the Playdate SDK (pdc, simulator, pdutil) behind typed tools.

## Entry Point Deviations

- No `enabled` toggle. The extension is always active when installed. There is no use case for installing it but disabling it.
- Uses `node:child_process` directly in `src/lib/sim.ts` for the simulator process. This is the documented exception -- pi.exec() does not support long-lived detached processes with stdout/stderr streaming.
- The `pi-no-node-exec` biome plugin is excluded from this project because of the above.

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format
- `pnpm gen:schema` - Generate JSON schema from config types
- `pnpm check:schema` - Verify committed schema matches config types
- `pnpm check:lockfile` - Verify lockfile is in sync

## Structure

```
src/
  index.ts           # Extension entry point
  config.ts          # PlaydateConfig / ResolvedPlaydateConfig + ConfigLoader
  lib/
    dap.ts           # DAP client for simulator communication (TCP port 55934)
    dap-queue.ts     # Sentinel key for serializing DAP-backed tool calls
    sdk.ts           # SDK path resolution, version, binary locations
    project.ts       # Project kind detection (lua/c/hybrid), pdxinfo, .pdx discovery
    device.ts        # Serial port scanning, data-disk mode, volume mount
    pdc.ts           # Run pdc, parse diagnostics
    cmake.ts         # CMake configure + build, parse gcc diagnostics
    sim.ts           # Spawn/kill simulator, log ring buffer, DAP lifecycle
    sim-control.ts   # Runtime simulator control via native CLI + injected dylib
    exec.ts          # Thin pi.exec wrapper
    state.ts         # Ephemeral runtime state (sim PID, log buffer, last build)
  tools/
    doctor.ts        # playdate_doctor
    build.ts         # playdate_build
    run_sim.ts       # playdate_run_sim
    stop_sim.ts      # playdate_stop_sim
    sim_log.ts       # playdate_sim_log
    screenshot.ts    # playdate_screenshot
    sim_input.ts     # playdate_sim_input
    sim_crank.ts     # playdate_sim_crank
    sim_accel.ts     # playdate_sim_accel
    sim_state.ts     # playdate_sim_state
    sim_game_state.ts# playdate_sim_game_state
    sim_game_state_write.ts # playdate_sim_game_state_write
    sim_eval.ts      # playdate_sim_eval
    run_device.ts    # playdate_run_device
  commands/
    doctor.ts        # /playdate:doctor
    sim.ts           # /playdate:sim
    device.ts        # /playdate:device
    settings.ts      # /playdate:settings (via registerSettingsCommand)
lua/
  ad.lua             # Debug helper module injected into the simulator DAP REPL
native/
  playdate-simctl.swift   # Swift CLI for dylib injection + socket IPC
  playdate-sim-agent.c    # Injected dylib with unix socket server
scripts/
  build-native-tools.sh   # Build native artifacts outside Nix shell
bin/
  playdate-simctl         # Built Swift CLI
  playdate-sim-agent.dylib# Built dylib injected into simulator
skills/
  playdate/
    SKILL.md
    references/      # SDK API references and project templates
docs/
  *.md               # Dev docs for internal architecture
```

## Design Decisions

- Tools parse subprocess output into structured `details`. Raw output is truncated.
- Simulator is the default target everywhere.
- Device deployment always requires `ctx.ui.confirm` -- no flag to skip.
- Project scaffolding is handled by the skill (reference templates), not a tool. The agent reads the templates and creates files with `write`.
- Runtime state (sim PID, log buffer, last build) is ephemeral -- never persisted to disk.
- The simulator log ring buffer is fed by both simulator stdout/stderr and DAP `output` events when available, so reused simulators still surface runtime console output.
- Clean shutdown in `session_shutdown` kills any tracked simulator process.
- DAP-backed tools (`sim_input`, `sim_eval`, `screenshot`, `sim_state`, `sim_game_state`, `sim_game_state_write`) are serialized via `withFileMutationQueue` with a shared sentinel key. This prevents parallel tool calls from interleaving DAP requests.
- `killSimulator` uses SIGKILL, not SIGTERM. Stuck simulators (e.g. after a Lua crash) ignore SIGTERM.
- `playdate_build` with `clean: true` auto-kills the simulator before building to avoid output directory conflicts.
- Common hardware reads should use `playdate_sim_state`. Structured game reads should use `playdate_sim_game_state` with the `__pi_state()` convention. Structured game writes should use `playdate_sim_game_state_write` with `__pi_state_write(payload, mode)`. `playdate_sim_eval` is for game-specific debugging outside that contract.
- Lua helpers are stored in `lua/`, not inline in TypeScript. `dap.ts` loads them at connect time.
- DAP debug helpers live under a single injected global module: `ad`.
- Crank/accelerometer control is implemented via a runtime-injected dylib plus a small Swift CLI, not by fake Lua callbacks.
- Native simulator control is macOS-only today.

## Dev docs

- `docs/injected-dylib.md` -- how the dylib is injected and what code paths it calls
- `docs/simulator-control-protocol.md` -- socket protocol between `playdate-simctl` and the injected agent
- `docs/dap-protocol.md` -- DAP connection, request flow, output-event logging, and why calls are serialized
- `docs/lua-injections.md` -- helper injection, table inspection, and eval ergonomics
- `docs/native-cli.md` -- native build flow, CLI responsibilities, and artifact layout
