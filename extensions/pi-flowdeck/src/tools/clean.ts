import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckCleanTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_clean",
    label: "FlowDeck Clean",
    description: "Clean build artifacts and caches.",
    subcommand: ["clean"],
  });
}
