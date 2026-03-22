import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckContextTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_context",
    label: "FlowDeck Context",
    description: "Inspect workspace, schemes, simulators, and build configs.",
    subcommand: ["context"],
  });
}
