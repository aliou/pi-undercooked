/**
 * Ephemeral runtime state -- lives in memory only, cleared on session_shutdown.
 */

// biome-ignore plugin: ChildProcess type needed for simulator process tracking
import type { ChildProcess } from "node:child_process";
import type { DapClient } from "./dap";

export interface BuildResult {
  kind: "lua" | "c" | "hybrid";
  target: "simulator" | "device";
  pdxPath: string;
  durationMs: number;
  warnings: DiagnosticEntry[];
  errors: DiagnosticEntry[];
}

export interface DiagnosticEntry {
  file: string;
  line: number;
  column?: number;
  message: string;
}

export interface RuntimeState {
  simProcess: ChildProcess | null;
  simPid: number | null;
  simStartedAt: string | null;
  simLogBuffer: string[];
  simLogTotalSeen: number;
  simLogMaxLines: number;
  lastBuildResult: BuildResult | null;
  lastDevicePort: string | null;
  dap: DapClient | null;
}

export function createRuntimeState(): RuntimeState {
  return {
    simProcess: null,
    simPid: null,
    simStartedAt: null,
    simLogBuffer: [],
    simLogTotalSeen: 0,
    simLogMaxLines: 200,
    lastBuildResult: null,
    lastDevicePort: null,
    dap: null,
  };
}

export function pushLogLine(
  state: RuntimeState,
  line: string,
  maxLines: number,
): void {
  state.simLogBuffer.push(line);
  state.simLogTotalSeen++;
  if (state.simLogBuffer.length > maxLines) {
    state.simLogBuffer.shift();
  }
}
