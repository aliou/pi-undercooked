import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedPlaydateConfig } from "../config";
import { runPdc } from "../lib/pdc";
import { detectProject } from "../lib/project";
import { findPdc, getSimulatorLaunchPath, resolveSDKPath } from "../lib/sdk";
import { runSimulator } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

export function registerSimCommand(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerCommand("playdate:sim", {
    description: "Build and run the current project in the Playdate Simulator",
    handler: async (_args, ctx) => {
      const sdkPath = resolveSDKPath(config);
      const cwd = ctx.cwd;

      // Build first
      try {
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

        // Run simulator
        const simPath = getSimulatorLaunchPath(sdkPath);
        if (!simPath) {
          ctx.ui.notify("Simulator not found", "error");
          return;
        }

        const { reused } = await runSimulator(
          simPath,
          project.outputDir,
          state,
          config.simulatorLogLines,
        );
        ctx.ui.setStatus("playdate", "sim running");
        ctx.ui.notify(
          reused ? "Game loaded in simulator" : "Simulator started",
          "info",
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ctx.ui.notify(msg, "error");
      }
    },
  });
}
