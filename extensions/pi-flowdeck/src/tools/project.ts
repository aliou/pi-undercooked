import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerFlowdeckProjectTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_project",
    label: "FlowDeck Project",
    description: "Project tools and Swift package operations.",
    subcommand: ["project"],
    actions: {
      create: ["create"],
      schemes: ["schemes"],
      configs: ["configs"],
      sync_profiles: ["sync-profiles"],
      packages_list: ["packages", "list"],
      packages_add: ["packages", "add"],
      packages_remove: ["packages", "remove"],
      packages_resolve: ["packages", "resolve"],
      packages_update: ["packages", "update"],
      packages_clear: ["packages", "clear"],
      packages_link: ["packages", "link"],
    },
  });
}
