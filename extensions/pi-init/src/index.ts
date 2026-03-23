import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createAskUserTool } from "./ask-user/tool";
import { INIT_PROMPT } from "./prompt";

export default function (pi: ExtensionAPI) {
  pi.registerTool(createAskUserTool(pi));

  pi.registerCommand("init", {
    description: "Initialize AGENTS.md, skills, and hooks for this project",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Starting project initialization...", "info");
      pi.sendUserMessage(INIT_PROMPT, { deliverAs: "followUp" });
    },
  });
}
