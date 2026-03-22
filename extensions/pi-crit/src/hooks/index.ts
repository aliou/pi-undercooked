import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupCleanupHook } from "./cleanup";
import { registerGuidance } from "./system-prompt";

export function registerHooks(pi: ExtensionAPI): void {
  registerGuidance(pi);
  setupCleanupHook(pi);
}
