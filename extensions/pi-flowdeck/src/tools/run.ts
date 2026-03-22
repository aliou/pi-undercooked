import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckRunTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_run",
    label: "FlowDeck Run",
    description: "Build and run app on simulator, device, or macOS.",
    subcommand: ["run"],
  });
}
