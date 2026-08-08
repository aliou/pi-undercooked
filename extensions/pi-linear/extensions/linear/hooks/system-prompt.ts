import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../config";
import { buildGuidance } from "../guidance";

export function registerGuidance(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const config = configLoader.getConfig();
    return {
      systemPrompt: `${event.systemPrompt}\n${buildGuidance(config)}`,
    };
  });
}
