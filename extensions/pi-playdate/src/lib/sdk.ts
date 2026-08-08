/**
 * SDK discovery: find PLAYDATE_SDK_PATH, detect version, locate binaries.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedPlaydateConfig } from "../config";

export interface SdkInfo {
  path: string;
  version: string;
  ok: boolean;
  error?: string;
}

export interface PdcInfo {
  path: string;
  ok: boolean;
  error?: string;
}

export interface SimulatorInfo {
  path: string;
  ok: boolean;
  error?: string;
}

export interface ArmToolchainInfo {
  path: string;
  ok: boolean;
  error?: string;
}

export interface CmakeInfo {
  ok: boolean;
  error?: string;
}

/**
 * Resolve the SDK root path from config override, env var, or platform default.
 */
export function resolveSDKPath(config: ResolvedPlaydateConfig): string {
  if (config.sdkPath) return config.sdkPath;
  if (process.env.PLAYDATE_SDK_PATH) return process.env.PLAYDATE_SDK_PATH;

  switch (process.platform) {
    case "darwin":
      return join(process.env.HOME ?? "/Users", "Developer/PlaydateSDK");
    case "win32":
      return join(
        process.env.USERPROFILE ?? "C:\\Users",
        "Documents/PlaydateSDK",
      );
    case "linux":
      return join(process.env.HOME ?? "/home", "PlaydateSDK");
    default:
      return "";
  }
}

/**
 * Read SDK version from VERSION.txt at the SDK root.
 */
export function readSdkVersion(sdkPath: string): SdkInfo {
  if (!sdkPath) {
    return {
      path: "",
      version: "",
      ok: false,
      error: "No SDK path configured",
    };
  }

  const versionFile = join(sdkPath, "VERSION.txt");
  if (!existsSync(versionFile)) {
    return {
      path: sdkPath,
      version: "",
      ok: false,
      error: `VERSION.txt not found at ${sdkPath}`,
    };
  }

  const version = readFileSync(versionFile, "utf-8").trim();
  return { path: sdkPath, version, ok: true };
}

/**
 * Locate the pdc compiler binary.
 */
export function findPdc(sdkPath: string): PdcInfo {
  const bin = process.platform === "win32" ? "pdc.exe" : "pdc";
  const path = join(sdkPath, "bin", bin);
  if (!existsSync(path)) {
    return { path, ok: false, error: `pdc not found at ${path}` };
  }
  return { path, ok: true };
}

/**
 * Locate the simulator binary (per-platform).
 */
export function findSimulator(sdkPath: string): SimulatorInfo {
  let path: string;
  switch (process.platform) {
    case "darwin":
      path = join(
        sdkPath,
        "bin",
        "Playdate Simulator.app",
        "Contents",
        "MacOS",
        "Playdate Simulator",
      );
      break;
    case "win32":
      path = join(sdkPath, "bin", "PlaydateSimulator.exe");
      break;
    case "linux":
      path = join(sdkPath, "bin", "PlaydateSimulator");
      break;
    default:
      return {
        path: "",
        ok: false,
        error: `Unsupported platform: ${process.platform}`,
      };
  }

  if (!existsSync(path)) {
    return { path, ok: false, error: `Simulator not found at ${path}` };
  }
  return { path, ok: true };
}

/**
 * Get the simulator app path for launching (e.g. the .app bundle on macOS).
 */
export function getSimulatorLaunchPath(sdkPath: string): string {
  switch (process.platform) {
    case "darwin":
      return join(sdkPath, "bin", "Playdate Simulator.app");
    case "win32":
      return join(sdkPath, "bin", "PlaydateSimulator.exe");
    case "linux":
      return join(sdkPath, "bin", "PlaydateSimulator");
    default:
      return "";
  }
}

/**
 * Find arm-none-eabi-gcc for C builds.
 */
export function findArmToolchain(
  config: ResolvedPlaydateConfig,
  sdkPath: string,
): ArmToolchainInfo {
  if (config.armToolchainPath) {
    const gcc = join(config.armToolchainPath, "bin", "arm-none-eabi-gcc");
    if (existsSync(gcc)) {
      return { path: config.armToolchainPath, ok: true };
    }
    return {
      path: config.armToolchainPath,
      ok: false,
      error: `arm-none-eabi-gcc not found at ${gcc}`,
    };
  }

  // Check PATH
  const pathDirs = (process.env.PATH ?? "").split(":");
  for (const dir of pathDirs) {
    if (existsSync(join(dir, "arm-none-eabi-gcc"))) {
      return { path: dir, ok: true };
    }
  }

  // macOS: SDK installer puts it in a known location
  if (process.platform === "darwin") {
    const candidates = [
      "/usr/local/playdate/gcc-arm-none-eabi-9-2019-q4-major/bin",
      "/usr/local/playdate/gcc-arm-none-eabi/bin",
    ];

    // Also check SDK-relative location
    const sdkToolchain = join(sdkPath, "C_API", "gcc-arm-none-eabi");
    if (existsSync(sdkToolchain)) {
      candidates.unshift(join(sdkToolchain, "bin"));
    }

    for (const dir of candidates) {
      if (existsSync(join(dir, "arm-none-eabi-gcc"))) {
        return { path: dir.replace(/\/bin$/, ""), ok: true };
      }
    }
  }

  return {
    path: "",
    ok: false,
    error: "arm-none-eabi-gcc not found in PATH or known locations",
  };
}

/**
 * Get the arm.cmake toolchain file path.
 */
export function getArmToolchainFile(sdkPath: string): string {
  return join(sdkPath, "C_API", "buildsupport", "arm.cmake");
}
