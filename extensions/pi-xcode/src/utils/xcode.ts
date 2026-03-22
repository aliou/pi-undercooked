import path from "node:path";
import { runCommand, splitLines } from "./exec";
import {
  ensureBooted,
  resolveSimulator,
  type SimulatorDevice,
} from "./simulator";

export interface XcodeLocationInput {
  projectPath?: string;
  workspacePath?: string;
  scheme?: string;
  configuration?: string;
}

function normalizePath(filePath: string, cwd: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

async function discoverXcodeTargets(
  cwd: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const result = await runCommand(
    "find",
    [
      ".",
      "-maxdepth",
      "8",
      "(",
      "-name",
      "*.xcworkspace",
      "-o",
      "-name",
      "*.xcodeproj",
      ")",
      "-not",
      "-path",
      "*/DerivedData/*",
      "-not",
      "-path",
      "*/build/*",
      "-not",
      "-path",
      "*/Pods/*",
      "-not",
      "-path",
      "*/.build/*",
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*.xcodeproj/*",
    ],
    { cwd, signal },
  );

  if (result.code !== 0) {
    throw new Error(
      result.stderr || result.stdout || "Failed to discover Xcode targets",
    );
  }

  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => normalizePath(line, cwd))
    .sort();
}

export async function resolveXcodeLocation(
  input: XcodeLocationInput,
  cwd: string,
  signal?: AbortSignal,
): Promise<XcodeLocationInput> {
  const workspacePath = input.workspacePath
    ? normalizePath(input.workspacePath, cwd)
    : undefined;
  const projectPath = input.projectPath
    ? normalizePath(input.projectPath, cwd)
    : undefined;

  if (workspacePath || projectPath) {
    return {
      ...input,
      workspacePath,
      projectPath: workspacePath ? undefined : projectPath,
    };
  }

  const targets = await discoverXcodeTargets(cwd, signal);
  if (targets.length === 0) {
    throw new Error(
      "No .xcworkspace or .xcodeproj found under current directory. Pass workspacePath or projectPath.",
    );
  }

  const workspaces = targets.filter((target) =>
    target.endsWith(".xcworkspace"),
  );
  const projects = targets.filter((target) => target.endsWith(".xcodeproj"));
  const preferred = workspaces.length > 0 ? workspaces : projects;

  if (preferred.length !== 1) {
    const candidates = preferred
      .slice(0, 20)
      .map((target) => path.relative(cwd, target));
    throw new Error(
      `Multiple Xcode targets found (${preferred.length}). Pass workspacePath or projectPath. Candidates: ${candidates.join(", ")}`,
    );
  }

  const selected = preferred[0]!;
  const isWorkspace = selected.endsWith(".xcworkspace");

  return {
    ...input,
    workspacePath: isWorkspace ? selected : undefined,
    projectPath: isWorkspace ? undefined : selected,
  };
}

export function buildLocationArgs(input: XcodeLocationInput): string[] {
  const args: string[] = [];

  if (input.workspacePath) {
    args.push("-workspace", input.workspacePath);
  } else if (input.projectPath) {
    args.push("-project", input.projectPath);
  }

  if (input.scheme) {
    args.push("-scheme", input.scheme);
  }

  if (input.configuration) {
    args.push("-configuration", input.configuration);
  }

  return args;
}

export async function listSchemes(
  input: XcodeLocationInput,
  signal?: AbortSignal,
): Promise<string[]> {
  const out = await runCommand(
    "xcodebuild",
    [...buildLocationArgs(input), "-list"],
    {
      signal,
    },
  );

  if (out.code !== 0) {
    throw new Error(out.stderr || "xcodebuild -list failed");
  }

  const lines = splitLines(out.stdout);
  const schemeIdx = lines.indexOf("Schemes:");
  if (schemeIdx === -1) {
    return [];
  }

  return lines.slice(schemeIdx + 1).filter((line) => !line.endsWith(":"));
}

export async function listTargets(
  input: XcodeLocationInput,
  signal?: AbortSignal,
): Promise<string[]> {
  const out = await runCommand(
    "xcodebuild",
    [...buildLocationArgs(input), "-list"],
    {
      signal,
    },
  );

  if (out.code !== 0) {
    throw new Error(out.stderr || "xcodebuild -list failed");
  }

  const lines = splitLines(out.stdout);
  const targetIdx = lines.indexOf("Targets:");
  if (targetIdx === -1) {
    return [];
  }

  return lines.slice(targetIdx + 1).filter((line) => !line.endsWith(":"));
}

export async function getAppPath(
  input: XcodeLocationInput,
  simulatorName: string,
  signal?: AbortSignal,
): Promise<string> {
  const settings = await runCommand(
    "xcodebuild",
    [
      ...buildLocationArgs(input),
      "-showBuildSettings",
      "-destination",
      `platform=iOS Simulator,name=${simulatorName}`,
    ],
    { signal },
  );

  if (settings.code !== 0) {
    throw new Error(settings.stderr || "Failed to read build settings");
  }

  const lines = splitLines(settings.stdout);
  const targetBuildDir = lines
    .find((line) => line.startsWith("TARGET_BUILD_DIR = "))
    ?.replace("TARGET_BUILD_DIR = ", "");
  const productName = lines
    .find((line) => line.startsWith("FULL_PRODUCT_NAME = "))
    ?.replace("FULL_PRODUCT_NAME = ", "");

  if (!targetBuildDir || !productName) {
    throw new Error("Could not resolve app output path from build settings");
  }

  return path.join(targetBuildDir, productName);
}

export async function getBundleIdFromApp(
  appPath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const infoPlist = path.join(appPath, "Info.plist");
  const out = await runCommand(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", infoPlist],
    { signal },
  );

  if (out.code !== 0) {
    return undefined;
  }

  const id = out.stdout.trim();
  return id.length > 0 ? id : undefined;
}

export async function ensureBootedSimulator(
  simulatorName: string,
  signal?: AbortSignal,
): Promise<SimulatorDevice> {
  return ensureBooted(simulatorName, signal);
}

export async function resolveBootedOrNamedSimulator(
  simulatorName: string,
  signal?: AbortSignal,
): Promise<SimulatorDevice> {
  return resolveSimulator(simulatorName, signal);
}

export function extractXcodeErrors(stderr: string, stdout: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const lines = splitLines(combined);
  const errorLines = lines.filter((line) => line.includes(" error: "));
  return errorLines.slice(0, 8);
}
