import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckTestTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_test",
    label: "FlowDeck Test",
    description: "Run tests, discover tests, or list test plans.",
    subcommand: ["test"],
    actions: {
      run: [],
      discover: ["discover"],
      plans: ["plans"],
    },
  });
}
