import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  AgentActivityCreateInput,
  OAuthTokenRow,
  OutboundActivityRow,
  SessionEventRow,
  SessionRow,
  SessionState,
  WebhookEventRow,
} from "./types";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS oauth_tokens (
  organization_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scope TEXT,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  linear_session_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  pi_session_path TEXT,
  issue_id TEXT,
  issue_identifier TEXT,
  issue_title TEXT,
  state TEXT NOT NULL DEFAULT 'idle',
  stop_requested INTEGER NOT NULL DEFAULT 0,
  terminal_emitted INTEGER NOT NULL DEFAULT 0,
  last_webhook_id TEXT,
  last_prompted_activity_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  dedupe_key TEXT PRIMARY KEY,
  linear_session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS outbound_activities (
  linear_session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  post_status TEXT NOT NULL DEFAULT 'pending',
  remote_activity_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  posted_at INTEGER,
  PRIMARY KEY (linear_session_id, sequence)
);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  linear_session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT,
  webhook_type TEXT,
  webhook_action TEXT,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_session
  ON webhook_events(linear_session_id, status);

CREATE INDEX IF NOT EXISTS idx_outbound_activities_status
  ON outbound_activities(linear_session_id, post_status);

CREATE INDEX IF NOT EXISTS idx_session_events_session
  ON session_events(linear_session_id, created_at);
`;

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // ---- OAuth tokens ----

  upsertToken(
    orgId: string,
    accessToken: string,
    refreshToken: string | null,
    scope: string | null,
    expiresAt: number | null,
  ): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO oauth_tokens (organization_id, access_token, refresh_token, scope, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         scope = excluded.scope,
         expires_at = excluded.expires_at,
         revoked_at = NULL,
         updated_at = excluded.updated_at`,
      )
      .run(orgId, accessToken, refreshToken, scope, expiresAt, now, now);
  }

  getToken(orgId: string): OAuthTokenRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM oauth_tokens WHERE organization_id = ? AND revoked_at IS NULL",
      )
      .get(orgId) as OAuthTokenRow | undefined;
  }

  getFirstToken(): OAuthTokenRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM oauth_tokens WHERE revoked_at IS NULL ORDER BY created_at ASC LIMIT 1",
      )
      .get() as OAuthTokenRow | undefined;
  }

  revokeToken(orgId: string): void {
    this.db
      .prepare(
        "UPDATE oauth_tokens SET revoked_at = ?, updated_at = ? WHERE organization_id = ?",
      )
      .run(Date.now(), Date.now(), orgId);
  }

  // ---- Sessions ----

  getSession(linearSessionId: string): SessionRow | undefined {
    return this.db
      .prepare("SELECT * FROM sessions WHERE linear_session_id = ?")
      .get(linearSessionId) as SessionRow | undefined;
  }

  createSession(
    linearSessionId: string,
    organizationId: string,
    issueId: string | null,
    issueIdentifier: string | null,
    issueTitle: string | null,
  ): SessionRow {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO sessions (linear_session_id, organization_id, issue_id, issue_identifier, issue_title, state, stop_requested, terminal_emitted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', 0, 0, ?, ?)`,
      )
      .run(
        linearSessionId,
        organizationId,
        issueId,
        issueIdentifier,
        issueTitle,
        now,
        now,
      );
    return this.getSession(linearSessionId) as SessionRow;
  }

  updateSessionState(linearSessionId: string, state: SessionState): void {
    this.db
      .prepare(
        "UPDATE sessions SET state = ?, updated_at = ? WHERE linear_session_id = ?",
      )
      .run(state, Date.now(), linearSessionId);
  }

  updateSessionPiPath(linearSessionId: string, piSessionPath: string): void {
    this.db
      .prepare(
        "UPDATE sessions SET pi_session_path = ?, updated_at = ? WHERE linear_session_id = ?",
      )
      .run(piSessionPath, Date.now(), linearSessionId);
  }

  setStopRequested(linearSessionId: string, value: boolean): void {
    this.db
      .prepare(
        "UPDATE sessions SET stop_requested = ?, updated_at = ? WHERE linear_session_id = ?",
      )
      .run(value ? 1 : 0, Date.now(), linearSessionId);
  }

  setTerminalEmitted(linearSessionId: string, value: boolean): void {
    this.db
      .prepare(
        "UPDATE sessions SET terminal_emitted = ?, updated_at = ? WHERE linear_session_id = ?",
      )
      .run(value ? 1 : 0, Date.now(), linearSessionId);
  }

  setLastWebhookId(linearSessionId: string, webhookId: string): void {
    this.db
      .prepare(
        "UPDATE sessions SET last_webhook_id = ?, updated_at = ? WHERE linear_session_id = ?",
      )
      .run(webhookId, Date.now(), linearSessionId);
  }

  setLastPromptedActivityId(linearSessionId: string, activityId: string): void {
    this.db
      .prepare(
        "UPDATE sessions SET last_prompted_activity_id = ?, updated_at = ? WHERE linear_session_id = ?",
      )
      .run(activityId, Date.now(), linearSessionId);
  }

  listSessions(): SessionRow[] {
    return this.db
      .prepare("SELECT * FROM sessions ORDER BY updated_at DESC")
      .all() as SessionRow[];
  }

  findActiveSessionsByIssueId(issueId: string): SessionRow[] {
    return this.db
      .prepare(
        "SELECT * FROM sessions WHERE issue_id = ? AND state IN ('idle', 'running', 'aborting', 'awaitingInput') ORDER BY updated_at DESC",
      )
      .all(issueId) as SessionRow[];
  }

  resetStaleRunningSessions(): number {
    const result = this.db
      .prepare(
        "UPDATE sessions SET state = 'failed', updated_at = ? WHERE state IN ('running', 'aborting')",
      )
      .run(Date.now());
    return result.changes;
  }

  /**
   * Find sessions that have a persisted Pi session file and can be rehydrated.
   * Returns sessions in non-terminal states (idle, running, awaitingInput) plus
   * completed/failed sessions that have a session file (for continuation support).
   */
  getRehydratableSessions(): SessionRow[] {
    return this.db
      .prepare(
        "SELECT * FROM sessions WHERE pi_session_path IS NOT NULL AND pi_session_path != '' ORDER BY updated_at DESC",
      )
      .all() as SessionRow[];
  }

  clearContinuationFlags(linearSessionId: string): void {
    this.db
      .prepare(
        "UPDATE sessions SET terminal_emitted = 0, stop_requested = 0, state = 'running', updated_at = ? WHERE linear_session_id = ?",
      )
      .run(Date.now(), linearSessionId);
  }

  // ---- Webhook events ----

  insertRawWebhook(
    deliveryId: string | null,
    webhookType: string | null,
    webhookAction: string | null,
    body: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO raw_webhooks (delivery_id, webhook_type, webhook_action, body, received_at)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(deliveryId, webhookType, webhookAction, body, Date.now());
  }

  hasWebhookEvent(dedupeKey: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM webhook_events WHERE dedupe_key = ?")
      .get(dedupeKey);
    return row !== undefined;
  }

  insertWebhookEvent(
    dedupeKey: string,
    linearSessionId: string,
    eventType: string,
    payload: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO webhook_events (dedupe_key, linear_session_id, event_type, payload, received_at, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      )
      .run(dedupeKey, linearSessionId, eventType, payload, Date.now());
  }

  getPendingWebhookEvents(linearSessionId: string): WebhookEventRow[] {
    return this.db
      .prepare(
        "SELECT * FROM webhook_events WHERE linear_session_id = ? AND status = 'pending' ORDER BY received_at ASC",
      )
      .all(linearSessionId) as WebhookEventRow[];
  }

  markWebhookEventProcessed(dedupeKey: string): void {
    this.db
      .prepare(
        "UPDATE webhook_events SET status = 'processed', processed_at = ? WHERE dedupe_key = ?",
      )
      .run(Date.now(), dedupeKey);
  }

  markWebhookEventFailed(dedupeKey: string): void {
    this.db
      .prepare(
        "UPDATE webhook_events SET status = 'failed', processed_at = ? WHERE dedupe_key = ?",
      )
      .run(Date.now(), dedupeKey);
  }

  cleanOldWebhookEvents(retentionDays: number = 7): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const result = this.db
      .prepare("DELETE FROM webhook_events WHERE received_at < ?")
      .run(cutoff);
    return result.changes;
  }

  // ---- Outbound activities ----

  getNextSequence(linearSessionId: string): number {
    const row = this.db
      .prepare(
        "SELECT MAX(sequence) as max_seq FROM outbound_activities WHERE linear_session_id = ?",
      )
      .get(linearSessionId) as { max_seq: number | null } | undefined;
    return (row?.max_seq ?? 0) + 1;
  }

  insertOutboundActivity(
    linearSessionId: string,
    sequence: number,
    contentType: string,
    payload: AgentActivityCreateInput,
  ): void {
    this.db
      .prepare(
        `INSERT INTO outbound_activities (linear_session_id, sequence, content_type, payload, post_status, attempt_count, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
      )
      .run(
        linearSessionId,
        sequence,
        contentType,
        JSON.stringify(payload),
        Date.now(),
      );
  }

  getPendingOutboundActivities(linearSessionId: string): OutboundActivityRow[] {
    return this.db
      .prepare(
        "SELECT * FROM outbound_activities WHERE linear_session_id = ? AND post_status = 'pending' ORDER BY sequence ASC",
      )
      .all(linearSessionId) as OutboundActivityRow[];
  }

  markOutboundPosted(
    linearSessionId: string,
    sequence: number,
    remoteActivityId: string | null,
  ): void {
    this.db
      .prepare(
        "UPDATE outbound_activities SET post_status = 'posted', remote_activity_id = ?, posted_at = ?, attempt_count = attempt_count + 1 WHERE linear_session_id = ? AND sequence = ?",
      )
      .run(remoteActivityId, Date.now(), linearSessionId, sequence);
  }

  incrementOutboundAttempt(linearSessionId: string, sequence: number): void {
    this.db
      .prepare(
        "UPDATE outbound_activities SET attempt_count = attempt_count + 1 WHERE linear_session_id = ? AND sequence = ?",
      )
      .run(linearSessionId, sequence);
  }

  // ---- Session events (dashboard log) ----

  addSessionEvent(
    linearSessionId: string,
    eventType: string,
    level: "info" | "warn" | "error",
    message: string,
    data?: unknown,
  ): void {
    this.db
      .prepare(
        `INSERT INTO session_events (linear_session_id, event_type, level, message, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        linearSessionId,
        eventType,
        level,
        message,
        data !== undefined ? JSON.stringify(data) : null,
        Date.now(),
      );
  }

  getSessionEvents(
    linearSessionId: string,
    limit: number = 100,
  ): SessionEventRow[] {
    return this.db
      .prepare(
        "SELECT * FROM session_events WHERE linear_session_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(linearSessionId, limit) as SessionEventRow[];
  }
}
