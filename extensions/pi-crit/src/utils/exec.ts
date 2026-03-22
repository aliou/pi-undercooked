import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";
import { getCritLockPath, withCritJsonLock } from "./crit-lock";

interface CritExecOptions {
  args: string[];
  cwd?: string;
  signal?: AbortSignal;
  /**
   * Include --share-url from config. Only commands that parse it
   * should set this (share, unpublish). Commands like comment, pull,
   * push do not support --share-url and will treat it as a positional arg.
   */
  includeShareUrl?: boolean;
  /**
   * Serialize commands that mutate .crit.json to avoid concurrent write races.
   */
  lockCritJson?: boolean;
}

/**
 * Run a crit CLI command via pi.exec.
 * Adds --output from config always. Adds --share-url only when requested.
 */
export async function critExec(
  pi: ExtensionAPI,
  options: CritExecOptions,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const config = configLoader.getConfig();
  const args = [...options.args];

  if (options.includeShareUrl && config.shareUrl) {
    args.push("--share-url", config.shareUrl);
  }

  if (config.outputDir) {
    args.push("--output", config.outputDir);
  }

  const cwd = options.cwd ?? process.cwd();

  const run = () =>
    pi.exec("crit", args, {
      cwd,
      signal: options.signal,
    });

  if (options.lockCritJson) {
    const outputDir = config.outputDir ? resolve(cwd, config.outputDir) : cwd;
    const lockPath = getCritLockPath(cwd, outputDir);
    return withCritJsonLock(lockPath, run, options.signal);
  }

  return run();
}
