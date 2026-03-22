import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReminderHooks } from "./reminder";
import { registerSystemPromptHooks } from "./system-prompt";

/**
 * Register all hooks for the output style extension.
 */
export function registerHooks(pi: ExtensionAPI) {
  registerSystemPromptHooks(pi);
  registerReminderHooks(pi);
}
