import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSetupCommand } from "./setup";

export function registerCommands(pi: ExtensionAPI) {
  registerSetupCommand(pi);
}
