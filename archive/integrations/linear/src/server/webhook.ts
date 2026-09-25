import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "./config";
import type { SessionStore } from "./session-store";
import type { AgentSessionEventWebhook } from "./types";

/**
 * Verify Linear webhook signature using HMAC-SHA256.
 * Returns true if valid, false otherwise.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Build a dedupe key for a webhook event.
 * Uses the linear-delivery header (unique per delivery) as primary key.
 * Falls back to timestamp + session + action if delivery header is absent.
 */
export function buildDedupeKey(
  webhook: AgentSessionEventWebhook,
  deliveryId: string | null,
): string {
  if (deliveryId) {
    return deliveryId;
  }
  // Fallback: combine timestamp, session, and action for uniqueness
  return `${webhook.webhookTimestamp}:${webhook.agentSession.id}:${webhook.action}`;
}

/**
 * Normalize user input from a prompted webhook event.
 * Following the mapping doc's normalization contract.
 */
export function normalizePromptedInput(
  webhook: AgentSessionEventWebhook,
): string {
  // 1. If content.type === "prompt" and body is non-empty, use body
  if (
    webhook.agentActivity?.content?.type === "prompt" &&
    webhook.agentActivity.content.body
  ) {
    return webhook.agentActivity.content.body;
  }

  // 2. Fallback to safe placeholder
  return "User sent a follow-up";
}

export type WebhookProcessResult = {
  status: "ok" | "duplicate" | "invalid" | "unknown_type";
  sessionId?: string;
};

/**
 * Process and persist a verified webhook payload.
 * Fast path: dedupe, persist, return. Async processing happens elsewhere.
 */
export function processWebhook(
  webhook: AgentSessionEventWebhook,
  _config: Config,
  store: SessionStore,
  deliveryId: string | null,
): WebhookProcessResult {
  if (webhook.type !== "AgentSessionEvent") {
    return { status: "unknown_type" };
  }

  const dedupeKey = buildDedupeKey(webhook, deliveryId);

  // Dedupe check
  if (store.hasWebhookEvent(dedupeKey)) {
    return { status: "duplicate", sessionId: webhook.agentSession.id };
  }

  const sessionId = webhook.agentSession.id;

  // Persist the webhook event
  store.insertWebhookEvent(
    dedupeKey,
    sessionId,
    webhook.action,
    JSON.stringify(webhook),
  );

  return { status: "ok", sessionId };
}
