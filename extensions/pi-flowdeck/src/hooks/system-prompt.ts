import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";
import { guidance } from "../guidance";

export function registerGuidance(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const config = configLoader.getConfig();
    if (!config.systemPromptGuidance) return;

    return {
      systemPrompt: `${event.systemPrompt}\n${guidance}`,
    };
  });
}
