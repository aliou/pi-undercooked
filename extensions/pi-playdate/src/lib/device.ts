/**
 * Device management: serial port discovery, data-disk mode, volume mount detection.
 */

import { existsSync, readdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface DeviceInfo {
  port: string | null;
  connected: boolean;
}

/**
 * Scan for connected Playdate device by looking for serial ports.
 */
export function findDevice(): DeviceInfo {
  switch (process.platform) {
    case "darwin":
      return findDeviceMacOS();
    case "linux":
      return findDeviceLinux();
    case "win32":
      return findDeviceWindows();
    default:
      return { port: null, connected: false };
  }
}

function findDeviceMacOS(): DeviceInfo {
  try {
    const devDir = "/dev";
    const entries = readdirSync(devDir);
    for (const entry of entries) {
      if (entry.match(/^cu\.(usbmodem|PDU1)/i)) {
        return { port: join(devDir, entry), connected: true };
      }
    }
  } catch (_e) {
    return { port: null, connected: false };
  }
  return { port: null, connected: false };
}

function findDeviceLinux(): DeviceInfo {
  try {
    const devDir = "/dev";
    const entries = readdirSync(devDir);
    for (const entry of entries) {
      if (entry.match(/^ttyACM\d+$/)) {
        return { port: join(devDir, entry), connected: true };
      }
    }
  } catch (_e) {
    return { port: null, connected: false };
  }
  return { port: null, connected: false };
}

function findDeviceWindows(): DeviceInfo {
  // On Windows, serial ports are COM ports. We can't easily scan without
  // additional tooling, so return not-found and let pdutil handle detection.
  return { port: null, connected: false };
}

/**
 * Get the expected mount path for the Playdate data disk volume.
 */
export function getDataDiskMountPath(): string {
  switch (process.platform) {
    case "darwin":
      return "/Volumes/PLAYDATE";
    case "linux":
      return `/media/${process.env.USER ?? "user"}/PLAYDATE`;
    case "win32":
      // On Windows, check common drive letters
      for (const letter of ["D", "E", "F", "G"]) {
        const path = `${letter}:\\`;
        if (existsSync(join(path, "Games"))) {
          return path;
        }
      }
      return "D:\\";
    default:
      return "";
  }
}

/**
 * Enter data-disk mode via pdutil.
 */
export async function enterDataDiskMode(
  pi: ExtensionAPI,
  pdutilPath: string,
  port: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const result = await pi.exec(pdutilPath, [port, "datadisk"], {
    signal: opts?.signal,
  });
  if (result.code !== 0) {
    throw new Error(
      `Failed to enter data-disk mode: ${result.stderr || result.stdout}`,
    );
  }
}

async function isVolumeReady(mountPath: string): Promise<boolean> {
  const gamesPath = join(mountPath, "Games");
  const probePath = join(mountPath, ".pi-playdate-write-test");

  if (!existsSync(mountPath) || !existsSync(gamesPath)) {
    return false;
  }

  try {
    await writeFile(probePath, "ok");
    await rm(probePath, { force: true });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Wait for the PLAYDATE volume to mount and become writable.
 */
export async function waitForVolume(
  mountPath: string,
  timeoutMs: number = 30000,
  signal?: AbortSignal,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new Error("Cancelled");

    const ready = await isVolumeReady(mountPath);
    if (ready) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Playdate volume did not become ready at ${mountPath} within ${timeoutMs / 1000}s`,
  );
}

/**
 * Run a game on the device via pdutil.
 */
export async function runOnDevice(
  pi: ExtensionAPI,
  pdutilPath: string,
  port: string,
  gamePath: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const result = await pi.exec(pdutilPath, [port, "run", gamePath], {
    signal: opts?.signal,
  });
  if (result.code !== 0) {
    throw new Error(
      `Failed to run game on device: ${result.stderr || result.stdout}`,
    );
  }
}

/**
 * Capture device serial output for a short period.
 */
export async function readDeviceLog(
  pi: ExtensionAPI,
  port: string,
  durationMs: number,
  opts?: { signal?: AbortSignal },
): Promise<string[]> {
  const scriptPath = join(tmpdir(), "pi-playdate-read-device-log.py");
  const script = [
    "import os",
    "import select",
    "import sys",
    "import time",
    "import termios",
    "import tty",
    "port = sys.argv[1]",
    "duration = max(float(sys.argv[2]) / 1000.0, 0.1)",
    "fd = os.open(port, os.O_RDONLY | os.O_NONBLOCK)",
    "attrs = termios.tcgetattr(fd)",
    "attrs[4] = termios.B115200",
    "attrs[5] = termios.B115200",
    "attrs[3] = attrs[3] & ~termios.ECHO",
    "termios.tcsetattr(fd, termios.TCSANOW, attrs)",
    "deadline = time.monotonic() + duration",
    "while time.monotonic() < deadline:",
    "    remaining = max(0.0, deadline - time.monotonic())",
    "    timeout = min(0.2, remaining)",
    "    ready, _, _ = select.select([fd], [], [], timeout)",
    "    if not ready:",
    "        continue",
    "    chunk = os.read(fd, 4096)",
    "    if chunk:",
    "        sys.stdout.buffer.write(chunk)",
    "        sys.stdout.buffer.flush()",
    "os.close(fd)",
    "",
  ].join("\n");

  await writeFile(scriptPath, script);

  const result = await pi.exec("python3", [scriptPath, port, `${durationMs}`], {
    signal: opts?.signal,
  });
  await rm(scriptPath, { force: true });

  if (result.code !== 0) {
    throw new Error(
      `Failed to read device log: ${result.stderr || result.stdout}`,
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

/**
 * Get pdutil binary path.
 */
export function findPdutil(sdkPath: string): string {
  const bin = process.platform === "win32" ? "pdutil.exe" : "pdutil";
  return join(sdkPath, "bin", bin);
}
