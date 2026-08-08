import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedPlaydateConfig } from "../config";
import type { RuntimeState } from "../lib/state";
import { registerDeviceCommand } from "./device";
import { registerDoctorCommand } from "./doctor";
import { registerPlaydateSettings } from "./settings";
import { registerSimCommand } from "./sim";

export function registerCommands(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  registerDoctorCommand(pi, config);
  registerSimCommand(pi, config, state);
  registerDeviceCommand(pi, config, state);
  registerPlaydateSettings(pi);
}
