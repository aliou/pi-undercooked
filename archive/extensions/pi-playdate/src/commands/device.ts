import { cpSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedPlaydateConfig } from "../config";
import {
  enterDataDiskMode,
  findDevice,
  findPdutil,
  getDataDiskMountPath,
  runOnDevice,
  waitForVolume,
} from "../lib/device";
import { runPdc } from "../lib/pdc";
import { detectProject } from "../lib/project";
import { findPdc, resolveSDKPath } from "../lib/sdk";
import type { RuntimeState } from "../lib/state";

export function registerDeviceCommand(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerCommand("playdate:device", {
    description: "Build and deploy the current project to a connected Playdate",
    handler: async (_args, ctx) => {
      const sdkPath = resolveSDKPath(config);
      const cwd = ctx.cwd;

      try {
        // Build
        const project = detectProject(cwd);
        const pdc = findPdc(sdkPath);
        if (!pdc.ok) {
          ctx.ui.notify(`pdc not found: ${pdc.error}`, "error");
          return;
        }

        ctx.ui.notify("Building...", "info");
        const result = await runPdc(
          pi,
          pdc.path,
          project.sourceDir,
          project.outputDir,
          { cwd },
        );
        if (!result.success) {
          ctx.ui.notify(
            `Build failed: ${result.errors.length} error(s)`,
            "error",
          );
          return;
        }

        // Find device
        const device = findDevice();
        if (!device.connected || !device.port) {
          ctx.ui.notify("No Playdate device connected", "error");
          return;
        }

        const port = device.port;
        const pdxName = basename(project.outputDir);
        state.lastDevicePort = port;

        // Confirm
        const confirmed = await ctx.ui.confirm(
          "Install on Playdate?",
          `Upload ${pdxName} to device at ${port}?`,
        );
        if (!confirmed) {
          ctx.ui.notify("Deployment cancelled", "info");
          return;
        }

        // Deploy
        const pdutilPath = findPdutil(sdkPath);
        await enterDataDiskMode(pi, pdutilPath, port);

        const volumePath = getDataDiskMountPath();
        await waitForVolume(volumePath);

        const destPath = join(volumePath, "Games", pdxName);
        cpSync(project.outputDir, destPath, { recursive: true });

        await pi.exec("sync", [], {});

        if (process.platform === "darwin") {
          await pi.exec("diskutil", ["eject", volumePath], {});
        } else if (process.platform === "linux") {
          await pi.exec("umount", [volumePath], {});
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        await runOnDevice(pi, pdutilPath, port, `/Games/${pdxName}`);

        ctx.ui.notify(`${pdxName} deployed and launched`, "info");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ctx.ui.notify(msg, "error");
      }
    },
  });
}
