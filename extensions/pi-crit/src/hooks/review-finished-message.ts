import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

export const CRIT_REVIEW_FINISHED_TYPE = "crit-review-finished";

interface ReviewFinishedDetails {
  status?: "finished" | "error";
  sessionId?: string;
  port?: number;
  url?: string;
  reviewFile?: string;
  prompt?: string;
  error?: string;
}

function contentToText(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((item): item is { type: "text"; text: string } =>
      item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

function truncatePreview(text: string, max = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function registerReviewFinishedMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(
    CRIT_REVIEW_FINISHED_TYPE,
    (message, { expanded }, theme) => {
      const details = message.details as ReviewFinishedDetails | undefined;

      const contentText = contentToText(message.content);

      if (!details) {
        return new Text(contentText || "Crit review event", 0, 0);
      }

      const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));

      const title =
        details.status === "error"
          ? theme.fg("error", "Crit review listener error")
          : theme.fg("success", "Crit review finished");
      box.addChild(new Text(title, 0, 0));

      const meta: string[] = [];
      if (details.sessionId) meta.push(`session ${details.sessionId}`);
      if (details.port) meta.push(`port ${details.port}`);
      if (details.reviewFile) meta.push(details.reviewFile);
      if (meta.length > 0) {
        box.addChild(new Text(theme.fg("muted", meta.join(" | ")), 0, 1));
      }

      if (details.url) {
        box.addChild(new Text(theme.fg("accent", details.url), 0, 1));
      }

      if (details.status === "error") {
        const errorText = details.error ?? contentText;
        if (errorText) {
          box.addChild(new Text(theme.fg("error", errorText), 0, 1));
        }
        return box;
      }

      const promptText = details.prompt || contentText;
      if (promptText) {
        const preview = expanded ? promptText.trim() : truncatePreview(promptText);
        box.addChild(new Text(preview, 0, 1));
      }

      return box;
    },
  );
}
