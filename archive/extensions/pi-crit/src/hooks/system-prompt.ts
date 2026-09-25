import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";
import { CRIT_GUIDANCE } from "../guidance";

export function registerGuidance(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const config = configLoader.getConfig();
    if (!config.systemPromptGuidance) return;

    return {
      systemPrompt: `${event.systemPrompt}\n${CRIT_GUIDANCE}`,
    };
  });
}
