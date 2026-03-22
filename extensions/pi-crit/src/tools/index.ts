import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerClearTool } from "./crit-clear";
import { registerCommentTool } from "./crit-comment";
import { registerCommentReplyTool } from "./crit-comment-reply";
import { registerCommentsTool } from "./crit-comments";
import { registerPullTool } from "./crit-pull";
import { registerPushTool } from "./crit-push";
import { registerReviewTool } from "./crit-review";
import { registerShareTool } from "./crit-share";
import { registerUnpublishTool } from "./crit-unpublish";

export function registerTools(pi: ExtensionAPI): void {
  registerReviewTool(pi);
  registerCommentTool(pi);
  registerCommentReplyTool(pi);
  registerCommentsTool(pi);
  registerShareTool(pi);
  registerUnpublishTool(pi);
  registerClearTool(pi);
  registerPullTool(pi);
  registerPushTool(pi);
}
