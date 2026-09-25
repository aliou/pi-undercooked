import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { PlaydateConfig, ResolvedPlaydateConfig } from "../config";
import { configLoader } from "../config";

export function registerPlaydateSettings(
  pi: ExtensionAPI,
  onSave?: () => void,
): void {
  registerSettingsCommand<PlaydateConfig, ResolvedPlaydateConfig>(pi, {
    commandName: "playdate:settings",
    title: "Playdate Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: PlaydateConfig | null,
      resolved: ResolvedPlaydateConfig,
    ): SettingsSection[] => [
      {
        label: "SDK",
        items: [
          {
            id: "sdkPath",
            label: "SDK Path",
            description:
              "Override PLAYDATE_SDK_PATH env var. Leave empty to use env/default.",
            currentValue:
              (tabConfig?.sdkPath ?? resolved.sdkPath) || "(auto-detect)",
            values: undefined,
          },
          {
            id: "armToolchainPath",
            label: "ARM Toolchain Path",
            description:
              "Path to arm-none-eabi toolchain for C builds (auto-detected on macOS).",
            currentValue:
              (tabConfig?.armToolchainPath ?? resolved.armToolchainPath) ||
              "(auto-detect)",
            values: undefined,
          },
        ],
      },
      {
        label: "Build",
        items: [
          {
            id: "defaultTarget",
            label: "Default Target",
            description: "Default build/run target",
            currentValue: tabConfig?.defaultTarget ?? resolved.defaultTarget,
            values: ["simulator", "device"],
          },
          {
            id: "buildMode",
            label: "Build Mode",
            description: "Build mode for C projects",
            currentValue: tabConfig?.buildMode ?? resolved.buildMode,
            values: ["debug", "release"],
          },
        ],
      },
      {
        label: "Simulator",
        items: [
          {
            id: "autoOpenSimulator",
            label: "Auto-open Simulator",
            description: "Automatically open the simulator after building",
            currentValue:
              (tabConfig?.autoOpenSimulator ?? resolved.autoOpenSimulator)
                ? "on"
                : "off",
            values: ["on", "off"],
          },
          {
            id: "simulatorLogLines",
            label: "Log Buffer Size",
            description: "Number of simulator log lines to keep in memory",
            currentValue: String(
              tabConfig?.simulatorLogLines ?? resolved.simulatorLogLines,
            ),
            values: undefined,
          },
        ],
      },
    ],
    onSettingChange: (id, newValue, config) => {
      const updated = structuredClone(config);
      switch (id) {
        case "autoOpenSimulator":
          updated.autoOpenSimulator = newValue === "on";
          break;
        case "simulatorLogLines":
          updated.simulatorLogLines = Number.parseInt(newValue, 10) || 200;
          break;
        default:
          (updated as Record<string, unknown>)[id] = newValue;
          break;
      }
      return updated;
    },
    onSave: () => {
      onSave?.();
    },
  });
}
