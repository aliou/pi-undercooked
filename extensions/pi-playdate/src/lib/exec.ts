/**
 * Thin wrapper around pi.exec for consistent error handling.
 */

import type { ExecResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface ExecOpts {
  cwd?: string;
  signal?: AbortSignal;
  timeout?: number;
}

/**
 * Run a command via pi.exec. Throws if exit code is non-zero (unless allowNonZero).
 */
export async function run(
  pi: ExtensionAPI,
  cmd: string,
  args: string[],
  opts?: ExecOpts & { allowNonZero?: boolean },
): Promise<ExecResult> {
  const result = await pi.exec(cmd, args, {
    cwd: opts?.cwd,
    signal: opts?.signal,
    timeout: opts?.timeout,
  });

  if (result.code !== 0 && !opts?.allowNonZero) {
    const output = (result.stderr || result.stdout).trim();
    throw new Error(`${cmd} exited with code ${result.code}: ${output}`);
  }

  return result;
}
