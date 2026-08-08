/**
 * CMake configure + build for C Playdate projects.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { DiagnosticEntry } from "./state";

export interface CmakeResult {
  success: boolean;
  output: string;
  errors: DiagnosticEntry[];
  warnings: DiagnosticEntry[];
}

/**
 * Configure and build a C Playdate project with CMake.
 */
export async function cmakeBuild(
  pi: ExtensionAPI,
  projectPath: string,
  target: "simulator" | "device",
  opts: {
    sdkPath: string;
    buildMode: "debug" | "release";
    clean?: boolean;
    signal?: AbortSignal;
  },
): Promise<CmakeResult> {
  const buildDir =
    target === "simulator"
      ? join(projectPath, "build-sim")
      : join(projectPath, "build-device");

  if (opts.clean && existsSync(buildDir)) {
    rmSync(buildDir, { recursive: true, force: true });
  }

  mkdirSync(buildDir, { recursive: true });

  // Configure
  const configureArgs = [
    "-B",
    buildDir,
    "-S",
    projectPath,
    `-DCMAKE_BUILD_TYPE=${opts.buildMode === "release" ? "Release" : "Debug"}`,
  ];

  if (target === "device") {
    const toolchainFile = join(
      opts.sdkPath,
      "C_API",
      "buildsupport",
      "arm.cmake",
    );
    configureArgs.push(`-DCMAKE_TOOLCHAIN_FILE=${toolchainFile}`);
  }

  const configResult = await pi.exec("cmake", configureArgs, {
    cwd: projectPath,
    signal: opts.signal,
  });

  if (configResult.code !== 0) {
    const output = `${configResult.stdout}\n${configResult.stderr}`.trim();
    return {
      success: false,
      output,
      errors: parseGccDiagnostics(output, "error"),
      warnings: parseGccDiagnostics(output, "warning"),
    };
  }

  // Build
  const buildArgs = ["--build", buildDir];
  const buildResult = await pi.exec("cmake", buildArgs, {
    cwd: projectPath,
    signal: opts.signal,
  });

  const output = `${buildResult.stdout}\n${buildResult.stderr}`.trim();
  return {
    success: buildResult.code === 0,
    output,
    errors: parseGccDiagnostics(output, "error"),
    warnings: parseGccDiagnostics(output, "warning"),
  };
}

/**
 * Parse gcc/clang diagnostic output.
 * Format: file:line:col: error: message
 */
function parseGccDiagnostics(
  output: string,
  kind: "error" | "warning",
): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/);
    if (!match) continue;

    const [, file, lineStr, colStr, severity, message] = match;
    if (severity === kind) {
      entries.push({
        file,
        line: Number.parseInt(lineStr, 10),
        column: Number.parseInt(colStr, 10),
        message: message.trim(),
      });
    }
  }

  return entries;
}
