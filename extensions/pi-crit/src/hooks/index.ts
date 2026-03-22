import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupCleanupHook } from "./cleanup";
import { registerReviewFinishedMessageRenderer } from "./review-finished-message";
import { registerGuidance } from "./system-prompt";

export function registerHooks(pi: ExtensionAPI): void {
  registerGuidance(pi);
  registerReviewFinishedMessageRenderer(pi);
  setupCleanupHook(pi);
}
