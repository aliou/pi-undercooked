import type { AgentSessionEventWebhookPayload } from "@linear/sdk/webhooks";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { z } from "zod";
import type {
  agentActivityCreateInputSchema,
  outboundActivityContentSchema,
} from "./schemas";

// ============================================================
// Pi event types (from @mariozechner/pi-agent-core)
// ============================================================

export type { AgentEvent };

// ============================================================
// Linear webhook types (from @linear/sdk)
// ============================================================

export type AgentSessionEventWebhook = AgentSessionEventWebhookPayload;

// ============================================================
// Linear outbound activity types (derived from Zod schemas)
// ============================================================

export type OutboundActivityContent = z.infer<
  typeof outboundActivityContentSchema
>;

export type AgentToHumanSignal = "auth" | "select";

export type AgentActivityCreateInput = z.infer<
  typeof agentActivityCreateInputSchema
>;

// ============================================================
// Session state
// ============================================================

export type SessionState =
  | "idle"
  | "running"
  | "awaitingInput"
  | "aborting"
  | "completed"
  | "failed";

// ============================================================
// DB row types
// ============================================================

export type OAuthTokenRow = {
  organization_id: string;
  access_token: string;
  refresh_token: string | null;
  scope: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  updated_at: number;
};

export type SessionRow = {
  linear_session_id: string;
  organization_id: string;
  pi_session_path: string | null;
  issue_id: string | null;
  issue_identifier: string | null;
  issue_title: string | null;
  state: SessionState;
  stop_requested: number;
  terminal_emitted: number;
  last_webhook_id: string | null;
  last_prompted_activity_id: string | null;
  created_at: number;
  updated_at: number;
};

export type WebhookEventRow = {
  dedupe_key: string;
  linear_session_id: string;
  event_type: string;
  payload: string;
  received_at: number;
  processed_at: number | null;
  status: "pending" | "processed" | "failed";
};

export type OutboundActivityRow = {
  linear_session_id: string;
  sequence: number;
  content_type: string;
  payload: string;
  post_status: "pending" | "posted" | "failed";
  remote_activity_id: string | null;
  attempt_count: number;
  created_at: number;
  posted_at: number | null;
};

export type SessionEventRow = {
  id: number;
  linear_session_id: string;
  event_type: string;
  level: "info" | "warn" | "error";
  message: string;
  data: string | null;
  created_at: number;
};
