import { buildArgs, parseFlowDeckOutput } from "./parser";
import type { FlowDeckResult } from "./types";

/**
 * Executor interface - matches pi.exec return shape.
 * pi.exec(command, args, options) returns { stdout, stderr, code }
 */
export type ExecLike = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  killed?: boolean;
}

/** Cap raw stream text so a failing command cannot flood the model context. */
const RAW_STREAM_LIMIT = 4000;

function truncateStream(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= RAW_STREAM_LIMIT) return trimmed;
  return `...\n${trimmed.slice(-RAW_STREAM_LIMIT)}`;
}

export interface FlowDeckClientOptions {
  /** Path to the flowdeck binary. Defaults to "flowdeck". */
  binaryPath?: string;
  /** Default project directory. */
  cwd?: string;
  /** Default timeout in milliseconds. */
  timeout?: number;
}

/**
 * Pi-free client for the FlowDeck CLI.
 * All commands append `--json` and return normalized results.
 */
export class FlowDeckClient {
  private readonly binary: string;
  private readonly cwd?: string;
  private readonly timeout?: number;

  constructor(
    private readonly exec: ExecLike,
    options?: FlowDeckClientOptions,
  ) {
    this.binary = options?.binaryPath ?? "flowdeck";
    this.cwd = options?.cwd;
    this.timeout = options?.timeout;
  }

  // --- Core dev loop ---

  async build(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["build", ...args], options);
  }

  async run(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["run", ...args], options);
  }

  async test(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["test", ...args], options);
  }

  async clean(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["clean", ...args], options);
  }

  // --- Config ---

  async configGet(options?: ExecOptions): Promise<FlowDeckResult> {
    return this.runCommand(["config", "get"], options);
  }

  async configSet(
    args: string[],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["config", "set", ...args], options);
  }

  async configReset(options?: ExecOptions): Promise<FlowDeckResult> {
    return this.runCommand(["config", "reset"], options);
  }

  // --- Context / Project ---

  async context(options?: ExecOptions): Promise<FlowDeckResult> {
    return this.runCommand(["context"], options);
  }

  async projectSchemes(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["project", "schemes", ...args], options);
  }

  async projectConfigs(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["project", "configs", ...args], options);
  }

  async projectPackages(
    action: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["project", "packages", action, ...args], options);
  }

  async projectSyncProfiles(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["project", "sync-profiles", ...args], options);
  }

  // --- Simulator ---

  async simulatorList(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "list", ...args], options);
  }

  async simulatorBoot(
    udid: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "boot", udid], options);
  }

  async simulatorShutdown(
    udid: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "shutdown", udid], options);
  }

  async simulatorCreate(
    args: string[],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "create", ...args], options);
  }

  async simulatorDelete(
    target: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "delete", target], options);
  }

  async simulatorErase(
    udid: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "erase", udid], options);
  }

  async simulatorClone(
    source: string,
    args: string[],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "clone", source, ...args], options);
  }

  async simulatorRuntime(
    action: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["simulator", "runtime", action, ...args], options);
  }

  // --- Device ---

  async deviceList(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["device", "list", ...args], options);
  }

  async deviceInstall(
    udid: string,
    appPath: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["device", "install", udid, appPath], options);
  }

  async deviceUninstall(
    udid: string,
    bundleId: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["device", "uninstall", udid, bundleId], options);
  }

  async deviceLaunch(
    udid: string,
    bundleId: string,
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["device", "launch", udid, bundleId], options);
  }

  // --- App lifecycle ---

  async apps(
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["apps", ...args], options);
  }

  async logs(
    identifier: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["logs", identifier, ...args], options);
  }

  async stop(
    identifier: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["stop", identifier, ...args], options);
  }

  async uninstall(
    identifier: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["uninstall", identifier, ...args], options);
  }

  // --- UI: iOS Simulator ---

  async uiSimulator(
    action: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["ui", "simulator", action, ...args], options);
  }

  // --- UI: macOS ---

  async uiMac(
    action: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    return this.runCommand(["ui", "mac", action, ...args], options);
  }

  // --- Generic command runner ---

  async runCommand(
    command: string[],
    options?: ExecOptions,
  ): Promise<FlowDeckResult> {
    const args = buildArgs(command);
    const mergedOptions: ExecOptions = {
      cwd: options?.cwd ?? this.cwd,
      timeout: options?.timeout ?? this.timeout,
      signal: options?.signal,
    };

    const startTime = Date.now();

    try {
      const output = await this.exec(this.binary, args, mergedOptions);
      const durationMs = Date.now() - startTime;

      const result = parseFlowDeckOutput(
        output.stdout ?? "",
        output.stderr ?? "",
        command,
      );
      result.durationMs = durationMs;
      result.exitCode = output.code ?? undefined;

      // A killed process that still reported a terminal result is fine:
      // `run --log` and `logs` are stopped by timeout on purpose. A killed
      // process with no terminal result is a timeout, not a success.
      if (output.killed && !result.ok && result.error) {
        result.error.kind = "timeout";
        result.error.message = `FlowDeck command timed out or was interrupted: ${result.error.message}`;
      }

      // If the process was killed (timeout/signal) but we got valid parsed data,
      // don't override success — the app may still be running.
      if (
        !output.killed &&
        output.code !== 0 &&
        output.code !== null &&
        result.ok
      ) {
        result.ok = false;
        result.status = "error";
        if (!result.error) {
          result.error = {
            kind: "flowdeck_error",
            message:
              output.stderr?.trim() ||
              `FlowDeck exited with code ${output.code}`,
          };
        }
      }

      // Always retain both streams on failure. Dropping them is what forced
      // agents to re-run commands through raw bash to see the real error.
      if (!result.ok) {
        result.rawStdout ??= truncateStream(output.stdout);
        result.rawStderr ??= truncateStream(output.stderr);
      }

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return {
        ok: false,
        status: "error",
        command,
        durationMs,
        error: {
          kind: message.includes("timeout") ? "timeout" : "exec_error",
          message,
        },
      };
    }
  }
}
