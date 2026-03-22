import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { LINKUP_COMPANY_RESEARCH_GUIDANCE } from "../guidance";

export function registerGuidance(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n${LINKUP_COMPANY_RESEARCH_GUIDANCE}`,
    };
  });
}
