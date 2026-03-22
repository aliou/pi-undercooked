import type { TextContent, UserMessage } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getActiveStyle } from "../state";

/**
 * Register reminder injection hooks.
 * Injects a periodic user-role reminder message before every LLM call.
 * The reminder is not displayed in the UI (display: false).
 */
export function registerReminderHooks(pi: ExtensionAPI) {
  // Inject reminder as a user message before every LLM call
  pi.on("context", async (event, _ctx: ExtensionContext) => {
    const activeStyle = getActiveStyle();
    if (!activeStyle) {
      return;
    }

    const textContent: TextContent = {
      type: "text",
      text: `${activeStyle.name} output style is active. Remember to follow the specific guidelines for this style.`,
    };

    const reminder: UserMessage = {
      role: "user",
      content: [textContent],
      timestamp: Date.now(),
    };

    // Append reminder to messages array
    event.messages.push(reminder);
  });
}
