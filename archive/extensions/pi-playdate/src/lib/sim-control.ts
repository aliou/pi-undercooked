/**
 * Runtime simulator control via injected agent dylib.
 *
 * The `playdate-simctl` native helper injects `playdate-sim-agent.dylib` into
 * the running Playdate Simulator process and communicates with it over a
 * Unix socket. This avoids LLDB attach/detach cycles that freeze the
 * simulator. First call per simulator PID bootstraps the agent via LLDB
 * dlopen (~1s, visible pause). Subsequent calls are ~10ms pure IPC.
 *
 * macOS only.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { run } from "./exec";

const SIMCTL_BINARY = fileURLToPath(
  new URL("../../bin/playdate-simctl", import.meta.url),
);

export interface SimControlOpts {
  signal?: AbortSignal;
}

export interface CrankSetOpts extends SimControlOpts {
  docked?: boolean;
}

function ensurePlatform(): void {
  if (process.platform !== "darwin") {
    throw new Error("Simulator control agent is currently macOS-only.");
  }
  if (!existsSync(SIMCTL_BINARY)) {
    throw new Error(
      `playdate-simctl not found at ${SIMCTL_BINARY}. Run scripts/build-native-tools.sh`,
    );
  }
}

async function runSimCtl(
  pi: ExtensionAPI,
  args: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  ensurePlatform();
  const result = await run(pi, SIMCTL_BINARY, args, { signal });
  const stdout = (result.stdout || "").trim();
  if (!stdout) return {};
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error(`playdate-simctl returned non-JSON output: ${stdout}`);
  }
}

/** Ensure the agent is loaded in the simulator. Idempotent. */
export async function ensureAgent(
  pi: ExtensionAPI,
  pid: number,
  opts?: SimControlOpts,
): Promise<void> {
  await runSimCtl(pi, ["inject", "--pid", String(pid)], opts?.signal);
}

/** Set the crank angle (degrees). Optionally undock/dock first. */
export async function setSimulatorCrank(
  pi: ExtensionAPI,
  pid: number,
  angle: number,
  opts?: CrankSetOpts,
): Promise<Record<string, unknown>> {
  const args = ["crank-set", "--pid", String(pid), "--angle", String(angle)];
  if (opts?.docked !== undefined) {
    args.push("--docked", String(opts.docked));
  }
  return runSimCtl(pi, args, opts?.signal);
}

/** Dock or undock the crank. */
export async function setSimulatorCrankDocked(
  pi: ExtensionAPI,
  pid: number,
  docked: boolean,
  opts?: SimControlOpts,
): Promise<Record<string, unknown>> {
  return runSimCtl(
    pi,
    ["crank-dock", "--pid", String(pid), "--docked", String(docked)],
    opts?.signal,
  );
}

/** Set accelerometer values. */
export async function setSimulatorAccelerometer(
  pi: ExtensionAPI,
  pid: number,
  x: number,
  y: number,
  z: number,
  opts?: SimControlOpts,
): Promise<Record<string, unknown>> {
  return runSimCtl(
    pi,
    [
      "accel-set",
      "--pid",
      String(pid),
      "--x",
      String(x),
      "--y",
      String(y),
      "--z",
      String(z),
    ],
    opts?.signal,
  );
}

/** Open the Playdate system menu. */
export async function openSimulatorMenu(
  pi: ExtensionAPI,
  pid: number,
  opts?: SimControlOpts,
): Promise<Record<string, unknown>> {
  return runSimCtl(pi, ["menu-open", "--pid", String(pid)], opts?.signal);
}
