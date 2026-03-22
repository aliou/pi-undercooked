import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckAppsTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_apps",
    label: "FlowDeck Apps",
    description: "List apps launched by FlowDeck.",
    subcommand: ["apps"],
  });
}
