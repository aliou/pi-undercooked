/**
 * Dummy extension that registers a "ping" tool.
 * Used to verify that extension loading works in evals.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default (pi: ExtensionAPI) => {
  pi.registerTool({
    name: "ping",
    label: "Ping",
    description:
      "Returns 'pong'. Use this tool when the user asks you to ping.",
    parameters: Type.Object({}),
    async execute() {
      return { output: "pong" };
    },
  });
};
