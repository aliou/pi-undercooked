import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckToolRoot(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck",
    label: "FlowDeck",
    description: "Run FlowDeck with custom arguments.",
  });
}
