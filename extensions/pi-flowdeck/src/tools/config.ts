import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckConfigTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_config",
    label: "FlowDeck Config",
    description: "Manage saved project settings.",
    subcommand: ["config"],
    actions: {
      set: ["set"],
      get: ["get"],
      reset: ["reset"],
    },
  });
}
