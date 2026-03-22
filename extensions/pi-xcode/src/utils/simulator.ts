import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./exec";

export interface SimulatorDevice {
  name: string;
  udid: string;
  state: string;
  runtime: string;
  isAvailable: boolean;
}

interface SimctlListJson {
  devices: Record<
    string,
    Array<{
      name: string;
      udid: string;
      state: string;
      isAvailable: boolean;
    }>
  >;
}

function runtimeLabel(runtimeId: string): string {
  return runtimeId
    .replace("com.apple.CoreSimulator.SimRuntime.", "")
    .replaceAll("-", ".")
    .replace(/iOS\./, "iOS ");
}

export async function listSimulators(
  signal?: AbortSignal,
): Promise<SimulatorDevice[]> {
  const out = await runCommand(
    "xcrun",
    ["simctl", "list", "devices", "--json"],
    {
      signal,
    },
  );

  if (out.code !== 0) {
    throw new Error(out.stderr || "Failed to list simulators");
  }

  const json = JSON.parse(out.stdout) as SimctlListJson;
  const devices: SimulatorDevice[] = [];

  for (const [runtime, runtimeDevices] of Object.entries(json.devices)) {
    for (const device of runtimeDevices) {
      devices.push({
        name: device.name,
        udid: device.udid,
        state: device.state,
        runtime: runtimeLabel(runtime),
        isAvailable: device.isAvailable,
      });
    }
  }

  return devices.filter((d) => d.isAvailable);
}

export async function resolveSimulator(
  simulatorName: string,
  signal?: AbortSignal,
): Promise<SimulatorDevice> {
  const devices = await listSimulators(signal);

  const exact = devices.filter(
    (d) => d.name.toLowerCase() === simulatorName.toLowerCase(),
  );

  if (exact.length === 0) {
    throw new Error(`Simulator not found: ${simulatorName}`);
  }

  const booted = exact.find((d) => d.state === "Booted");
  if (booted) {
    return booted;
  }

  const first = exact.at(0);
  if (!first) {
    throw new Error(`Simulator not found: ${simulatorName}`);
  }

  return first;
}

export async function ensureBooted(
  simulatorName: string,
  signal?: AbortSignal,
): Promise<SimulatorDevice> {
  const device = await resolveSimulator(simulatorName, signal);

  if (device.state === "Booted") {
    return device;
  }

  const boot = await runCommand("xcrun", ["simctl", "boot", device.udid], {
    signal,
  });

  if (boot.code !== 0) {
    throw new Error(boot.stderr || `Failed to boot simulator ${device.name}`);
  }

  return resolveSimulator(simulatorName, signal);
}

export async function screenshot(
  simulatorName: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<{ path: string; base64: string }> {
  const device = await ensureBooted(simulatorName, signal);
  const dir = path.join(cwd, ".pi-xcode", "artifacts");
  await mkdir(dir, { recursive: true });

  const filePath = path.join(
    dir,
    `screenshot-${Date.now()}-${device.udid.slice(0, 8)}.png`,
  );

  const shot = await runCommand(
    "xcrun",
    ["simctl", "io", device.udid, "screenshot", filePath],
    {
      signal,
    },
  );

  if (shot.code !== 0) {
    throw new Error(shot.stderr || "Failed to capture screenshot");
  }

  const data = await readFile(filePath);
  return {
    path: filePath,
    base64: data.toString("base64"),
  };
}
