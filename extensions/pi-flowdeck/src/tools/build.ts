import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckBuildTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_build",
    label: "FlowDeck Build",
    description: "Build project for simulator, device, or macOS.",
    subcommand: ["build"],
  });
}
