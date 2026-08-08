import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedPlaydateConfig } from "../config";
import { findDevice } from "../lib/device";
import {
  findArmToolchain,
  findPdc,
  findSimulator,
  readSdkVersion,
  resolveSDKPath,
} from "../lib/sdk";

export function registerDoctorCommand(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
) {
  pi.registerCommand("playdate:doctor", {
    description: "Check Playdate SDK installation and environment",
    handler: async (_args, ctx) => {
      const sdkPath = resolveSDKPath(config);
      const sdk = readSdkVersion(sdkPath);
      const pdc = findPdc(sdkPath);
      const simulator = findSimulator(sdkPath);
      const armToolchain = findArmToolchain(config, sdkPath);
      const device = findDevice();

      const ok = (v: boolean) => (v ? "[ok]" : "[missing]");

      const lines = [
        `SDK: ${ok(sdk.ok)} ${sdk.ok ? `${sdk.version} at ${sdk.path}` : (sdk.error ?? "not found")}`,
        `pdc: ${ok(pdc.ok)}${!pdc.ok ? ` ${pdc.error}` : ""}`,
        `Simulator: ${ok(simulator.ok)}${!simulator.ok ? ` ${simulator.error}` : ""}`,
        `ARM Toolchain: ${ok(armToolchain.ok)}${!armToolchain.ok ? ` ${armToolchain.error}` : ""}`,
        `Device: ${device.connected ? `connected at ${device.port}` : "not connected"}`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
