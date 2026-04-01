import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupDumbZoneCommands } from "./commands";
import { setupDumbZoneHooks } from "./hooks";

/**
 * The Dumb Zone Extension
 *
 * Shows a warning widget when session quality signals degrade.
 */
export default function (pi: ExtensionAPI) {
  setupDumbZoneHooks(pi);
  setupDumbZoneCommands(pi);
}
