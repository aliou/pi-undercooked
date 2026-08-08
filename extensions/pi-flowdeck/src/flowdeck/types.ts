/**
 * FlowDeck CLI result types.
 * These mirror the JSON output shapes from `flowdeck --json` commands.
 * Kept Pi-free for testability and separation of concerns.
 */

/** Status of a FlowDeck command result. */
export type FlowDeckStatus = "success" | "warning" | "error" | "running";

/** Normalized result from any FlowDeck CLI command. */
export interface FlowDeckResult<T = unknown> {
  ok: boolean;
  status: FlowDeckStatus;
  data?: T;
  command: string[];
  durationMs?: number;
  exitCode?: number;
  error?: FlowDeckError;
  /** Raw stdout, retained whenever the command fails so the model can see it. */
  rawStdout?: string;
  /** Raw stderr. FlowDeck writes build and test diagnostics here, not to stdout. */
  rawStderr?: string;
}

export interface FlowDeckError {
  kind: "flowdeck_error" | "parse_error" | "exec_error" | "timeout";
  message: string;
  code?: string;
  details?: unknown;
}

// --- Domain-specific result types ---

export interface BuildResult {
  succeeded: boolean;
  scheme?: string;
  configuration?: string;
  target?: string;
  duration?: string;
  warnings?: number;
  diagnostics?: Array<{
    file: string;
    line?: number;
    message: string;
    severity: "error" | "warning";
  }>;
  logPath?: string;
}

export interface RunResult {
  launched: boolean;
  appId?: string;
  bundleId?: string;
  target?: string;
  simulator?: string;
  pid?: number;
  logPath?: string;
}

export interface TestResult {
  passed: boolean;
  total?: number;
  passedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  duration?: string;
  failedTests?: Array<{
    name: string;
    failureMessage?: string;
  }>;
  logPath?: string;
}

export interface ConfigResult {
  exists: boolean;
  workspace?: string;
  scheme?: string;
  simulator?: string;
  device?: string;
  configuration?: string;
}

export interface ContextResult {
  workspace?: string;
  schemes?: string[];
  configurations?: string[];
  simulators?: Array<{
    name: string;
    udid: string;
    state: string;
    runtime?: string;
  }>;
}

export interface SimulatorInfo {
  name: string;
  udid: string;
  state: string;
  runtime?: string;
  deviceType?: string;
}

export interface DeviceInfo {
  name: string;
  udid: string;
  platform?: string;
  model?: string;
}

export interface AppInfo {
  id: string;
  bundleId?: string;
  name?: string;
  status?: string;
  pid?: number;
}

export interface SessionResult {
  sessionId?: string;
  latestScreenshot?: string;
  latestTree?: string;
  latest?: string;
  sessionDir?: string;
  udid?: string;
}

export interface UiActionResult {
  success: boolean;
  element?: string;
  coordinates?: string;
  screenshotPath?: string;
  treePath?: string;
  message?: string;
}

export interface ProjectResult {
  schemes?: string[];
  configurations?: string[];
  packages?: unknown[];
}

export interface CleanResult {
  cleaned: boolean;
  path?: string;
}

export interface SimulatorRuntimeResult {
  runtimes?: Array<{
    name: string;
    identifier: string;
    version: string;
    platform: string;
  }>;
}

export interface PackageActionResult {
  succeeded: boolean;
  message?: string;
}

export interface LicenseResult {
  valid: boolean;
  status?: string;
  expiresAt?: string;
}

export interface UIAssertionResult {
  passed: boolean;
  assertion: string;
  target?: string;
  message?: string;
}
