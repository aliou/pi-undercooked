import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerSimulatorTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_simulator",
    label: "FlowDeck Simulator",
    description: "Simulator lifecycle, management, runtimes, and media.",
    subcommand: ["simulator"],
    actions: {
      list: ["list"],
      boot: ["boot"],
      shutdown: ["shutdown"],
      open: ["open"],
      erase: ["erase"],
      clear_cache: ["clear-cache"],
      create: ["create"],
      delete: ["delete"],
      prune: ["prune"],
      device_types: ["device-types"],
      runtime_list: ["runtime", "list"],
      runtime_available: ["runtime", "available"],
      runtime_create: ["runtime", "create"],
      runtime_delete: ["runtime", "delete"],
      runtime_prune: ["runtime", "prune"],
      location_set: ["location", "set"],
      media_add: ["media", "add"],
    },
  });
}
