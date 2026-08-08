/**
 * Simulator management: spawn, reuse, track, log.
 *
 * The simulator is a singleton app. On macOS, `open game.pdx` routes to the
 * running instance. We detect an existing simulator via DAP (TCP 55934) and
 * reuse it instead of spawning duplicates.
 */

// biome-ignore plugin: Uses node:child_process directly instead of pi.exec()
// because the simulator is a long-lived detached process that needs
// stdout/stderr piping into a ring buffer. pi.exec() does not support
// detached processes or streaming output.
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { DAP_PORT, DapClient } from "./dap";
import type { RuntimeState } from "./state";
import { pushLogLine } from "./state";

function createDapClient(state: RuntimeState): DapClient {
  return new DapClient((line) => {
    pushLogLine(state, line, state.simLogMaxLines);
  });
}

/**
 * Resolve the actual simulator executable path.
 * On macOS, if given a .app bundle, returns the internal binary so we get
 * the real long-lived process instead of a short-lived `open -a` launcher.
 */
function resolveSimulatorExecutable(simLaunchPath: string): string {
  if (process.platform !== "darwin") return simLaunchPath;

  if (simLaunchPath.endsWith(".app")) {
    const appName = simLaunchPath
      .split("/")
      .pop()
      ?.replace(/\.app$/, "");
    if (!appName) return simLaunchPath;
    const binaryPath = join(simLaunchPath, "Contents", "MacOS", appName);
    if (existsSync(binaryPath)) return binaryPath;
  }

  return simLaunchPath;
}

/**
 * Find the PID of a running Playdate Simulator process.
 * Returns the first matching PID, or null if none found.
 */
function findSimulatorPid(): number | null {
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      const out = execSync(
        'pgrep -f "Playdate Simulator.app/Contents/MacOS/Playdate" 2>/dev/null || true',
      )
        .toString()
        .trim();
      if (out) {
        const pid = parseInt(out.split("\n")[0], 10);
        if (!Number.isNaN(pid)) return pid;
      }
    }
  } catch (_e) {
    void _e;
  }
  return null;
}

/**
 * Check if a DAP server is reachable on the simulator port.
 * Uses a quick TCP connect probe with a short timeout.
 */
async function isDapReachable(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const sock = createConnection({ port: DAP_PORT }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(500, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

/**
 * Open a .pdx in the already-running simulator.
 * On macOS, `open game.pdx` routes to the running instance.
 */
function openPdxInRunningSimulator(pdxPath: string): void {
  if (process.platform === "darwin") {
    execSync(`open "${pdxPath}"`);
  }
  // Linux/Windows: the simulator is single-instance and accepts pdx as arg.
  // Spawning again with the pdx path will signal the existing instance.
}

export interface RunSimResult {
  pid: number;
  reused: boolean;
}

/**
 * Ensure a simulator is running with the given .pdx loaded.
 *
 * 1. If a simulator is already running (DAP reachable), open the .pdx in it
 *    and adopt its PID into state.
 * 2. Otherwise, spawn a new simulator process.
 *
 * In both cases, establishes a DAP connection.
 */
export async function runSimulator(
  simLaunchPath: string,
  pdxPath: string,
  state: RuntimeState,
  maxLogLines: number,
): Promise<RunSimResult> {
  state.simLogMaxLines = maxLogLines;
  // Check for an already-running simulator that is responsive (DAP reachable)
  const existingPid = findSimulatorPid();
  const dapReachable = existingPid ? await isDapReachable() : false;

  if (existingPid && !dapReachable) {
    // Simulator is running but unresponsive (stuck/crashed) -- kill it
    killSimulator(state);
    // Brief pause to let the OS reclaim the port
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
  }

  if (existingPid && dapReachable) {
    // Reuse the running simulator: open the new .pdx in it
    openPdxInRunningSimulator(pdxPath);

    // Adopt the existing PID
    state.simProcess = null; // we don't own the process
    state.simPid = existingPid;
    state.simStartedAt = state.simStartedAt ?? new Date().toISOString();
    // Don't clear log buffer on reuse -- keep accumulated logs

    // Reconnect DAP (new game may reset the Lua state)
    if (state.dap) {
      state.dap.disconnect();
    }
    const dap = createDapClient(state);
    state.dap = dap;
    try {
      // Brief delay for the new game to load after `open`
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      await dap.connect();
    } catch (_e) {
      void _e;
    }

    return { pid: existingPid, reused: true };
  }

  // No running simulator -- spawn a new one
  return spawnNewSimulator(simLaunchPath, pdxPath, state, maxLogLines);
}

/**
 * Spawn a fresh Playdate Simulator process.
 * Pipes stdout/stderr into the ring buffer in state.
 */
function spawnNewSimulator(
  simLaunchPath: string,
  pdxPath: string,
  state: RuntimeState,
  maxLogLines: number,
): RunSimResult {
  const cmd =
    process.platform === "darwin"
      ? resolveSimulatorExecutable(simLaunchPath)
      : simLaunchPath;
  const args = [pdxPath];

  const child = spawn(cmd, args, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.unref();

  state.simProcess = child;
  state.simPid = child.pid ?? null;
  state.simStartedAt = new Date().toISOString();
  state.simLogBuffer = [];
  state.simLogTotalSeen = 0;
  state.simLogMaxLines = maxLogLines;

  const onData = (data: Buffer) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        pushLogLine(state, line, maxLogLines);
      }
    }
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  const trackedPid = child.pid ?? null;
  child.on("exit", () => {
    if (state.simPid === trackedPid) {
      if (state.dap) {
        state.dap.disconnect();
        state.dap = null;
      }
      state.simProcess = null;
      state.simPid = null;
      state.simStartedAt = null;
    }
  });

  // Best-effort eager DAP connect. Tools also connect lazily on demand.
  const dap = createDapClient(state);
  state.dap = dap;
  setTimeout(async () => {
    try {
      await dap.connect();
    } catch (_e) {
      void _e;
    }
  }, 1500);

  return { pid: child.pid ?? 0, reused: false };
}

/**
 * Kill the simulator -- tracked process + any system-wide instances.
 */
export function killSimulator(state: RuntimeState): boolean {
  if (state.dap) {
    state.dap.disconnect();
    state.dap = null;
  }

  const hadPid = !!state.simPid;

  if (state.simPid) {
    try {
      process.kill(state.simPid, "SIGKILL");
    } catch (_e) {
      void _e;
    }
  }

  // Also force-kill any orphaned/adopted simulator processes.
  // Uses SIGKILL (-9) because SIGTERM may be ignored by stuck simulators.
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      execSync(
        'pkill -9 -f "Playdate Simulator.app/Contents/MacOS/Playdate" 2>/dev/null || true',
      );
    } else if (process.platform === "win32") {
      execSync("taskkill /F /IM PlaydateSimulator.exe 2>nul || exit 0");
    }
  } catch (_e) {
    void _e;
  }

  state.simProcess = null;
  state.simPid = null;
  state.simStartedAt = null;
  return hadPid;
}

/**
 * Check if the simulator is running.
 * Checks tracked PID first, then falls back to system-wide search.
 */
export function isSimulatorRunning(state: RuntimeState): boolean {
  // Check tracked PID
  if (state.simPid) {
    try {
      process.kill(state.simPid, 0);
      return true;
    } catch {
      state.simProcess = null;
      state.simPid = null;
    }
  }

  // Fall back to system-wide search (catches orphans/external launches)
  const pid = findSimulatorPid();
  if (pid) {
    state.simPid = pid;
    state.simProcess = null; // adopted, we don't own the process
    return true;
  }

  return false;
}

/**
 * Ensure a DAP connection to the running simulator.
 * If the simulator is running but DAP is not connected, connects lazily.
 * If the simulator is not running, throws.
 */
export async function ensureSimulatorDap(
  state: RuntimeState,
  signal?: AbortSignal,
): Promise<DapClient> {
  if (!isSimulatorRunning(state)) {
    throw new Error(
      "Simulator is not running. Start it first with playdate_run_sim.",
    );
  }

  if (!state.dap) {
    state.dap = createDapClient(state);
  }

  await state.dap.connect(undefined, signal);
  return state.dap;
}
