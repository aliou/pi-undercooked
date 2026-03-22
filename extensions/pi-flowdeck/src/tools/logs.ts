import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckLogsTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_logs",
    label: "FlowDeck Logs",
    description: "Stream logs for a running app.",
    subcommand: ["logs"],
  });
}
