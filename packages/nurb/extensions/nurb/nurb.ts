import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const NURB_NOT_INSTALLED =
  "nurb is not installed. Install with: uv tool install nurb";

// Cached per extension load; jiti reload creates a fresh module.
let binaryChecked = false;

// Lazy binary check: runs once, on the first tool call, never at load time.
export async function ensureNurbBinary(
  pi: ExtensionAPI,
  signal?: AbortSignal,
): Promise<void> {
  if (binaryChecked) return;
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await pi.exec(probe, ["nurb"], { signal });
  if (result.code === 0 && result.stdout.trim().length > 0) {
    binaryChecked = true;
    return;
  }
  throw new Error(NURB_NOT_INSTALLED);
}

export function nurbError(command: string, result: ExecResult): Error {
  const stderr = result.stderr.trim();
  if (stderr) return new Error(stderr);
  const stdout = result.stdout.trim();
  if (stdout) return new Error(stdout);
  return new Error(`nurb ${command} exited with code ${result.code}`);
}

// One-shot: run nurb, throw on failure, return stdout verbatim on success.
export async function runNurb(
  pi: ExtensionAPI,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await pi.exec("nurb", args, { cwd, signal });
  if (result.killed) throw new Error(`nurb ${args[0]} was aborted`);
  if (result.code !== 0) throw nurbError(args[0], result);
  return result.stdout;
}

function withPart(command: string, part?: string): string[] {
  if (!part) return [command];
  return [command, part];
}

export function newArgs(name: string): string[] {
  return ["new", name];
}

export function buildArgs(part?: string): string[] {
  return withPart("build", part);
}

export function checkArgs(part?: string, strict?: boolean): string[] {
  const args = withPart("check", part);
  if (strict) args.push("--strict");
  return args;
}

export function inspectArgs(part?: string, render?: boolean): string[] {
  const args = withPart("inspect", part);
  if (render) args.push("--render");
  return args;
}

export function exportArgs(part?: string, formats?: string[]): string[] {
  const args = withPart("export", part);
  if (formats && formats.length > 0) args.push("--formats", ...formats);
  return args;
}

export function renderArgs(part?: string, section?: string): string[] {
  const args = withPart("render", part);
  if (section) args.push("--section", section);
  return args;
}

export function scanArgs(file: string, section?: string): string[] {
  const args = ["scan", file];
  if (section) args.push("--section", section);
  return args;
}

export function compareArgs(part?: string, against?: string): string[] {
  const args = withPart("compare", part);
  if (against) args.push("--against", against);
  return args;
}

export function verifyArgs(part?: string, report?: boolean): string[] {
  const args = withPart("verify", part);
  if (report) args.push("--report");
  return args;
}
