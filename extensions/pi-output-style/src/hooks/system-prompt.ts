import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getActiveStyle } from "../state";

/**
 * Register system prompt modification hooks.
 * Injects the active output style into the system prompt.
 */
export function registerSystemPromptHooks(pi: ExtensionAPI) {
  // Modify system prompt before each agent turn
  pi.on("before_agent_start", async (event, _ctx: ExtensionContext) => {
    const activeStyle = getActiveStyle();
    if (!activeStyle) {
      return;
    }

    const styleSection = `\n\n# Output Style: ${activeStyle.name}\n${activeStyle.prompt}`;
    return {
      systemPrompt: event.systemPrompt + styleSection,
    };
  });
}
