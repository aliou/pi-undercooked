import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckStopTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_stop",
    label: "FlowDeck Stop",
    description: "Stop a running app.",
    subcommand: ["stop"],
  });
}
