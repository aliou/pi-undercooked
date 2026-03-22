import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerDeviceTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_device",
    label: "FlowDeck Device",
    description: "Physical device commands.",
    subcommand: ["device"],
    actions: {
      list: ["list"],
      install: ["install"],
      uninstall: ["uninstall"],
      launch: ["launch"],
    },
  });
}
