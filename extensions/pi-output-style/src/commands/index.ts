import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerOutputStyleCommand } from "./output-style";

/**
 * Register all commands for the output style extension.
 */
export function registerCommands(pi: ExtensionAPI) {
  registerOutputStyleCommand(pi);
}
