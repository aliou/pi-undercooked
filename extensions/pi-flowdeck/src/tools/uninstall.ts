import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckUninstallTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_uninstall",
    label: "FlowDeck Uninstall",
    description: "Uninstall app from simulator or device.",
    subcommand: ["uninstall"],
  });
}
