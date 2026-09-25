import { dirname, join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { AppEnv } from "./app-env";
import { loadConfig } from "./config";
import { LinearClient } from "./linear-client";
import { createOAuthRoutes } from "./oauth";
import { PiBridge } from "./pi-bridge";
import { PiSessionManager } from "./pi-session-manager";
import { SessionStore } from "./session-store";
import type { AgentSessionEventWebhook } from "./types";
import { processWebhook, verifyWebhookSignature } from "./webhook";

const config = loadConfig();
const store = new SessionStore(config.DB_PATH);
const linearClient = new LinearClient(config);
const piSessionsDir = join(dirname(config.DB_PATH), "pi-sessions");
const piSessionManager = new PiSessionManager(piSessionsDir);
const bridge = new PiBridge(config, store, piSessionManager, linearClient);

const staleCount = store.resetStaleRunningSessions();
if (staleCount > 0) {
  console.log(`Reset ${staleCount} stale running sessions to failed`);
}

bridge.rehydrateSessions().catch((err) => {
  console.error("Failed to rehydrate sessions:", err);
});

const cleanedCount = store.cleanOldWebhookEvents();
if (cleanedCount > 0) {
  console.log(`Cleaned ${cleanedCount} old webhook events`);
}

const app = new Hono<AppEnv>();

app.use("*", logger());

app.use("*", async (c, next) => {
  c.set("config", config);
  c.set("store", store);
  await next();
});

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    activeSessions: piSessionManager.activeCount(),
  });
});

// OAuth routes
app.route("/oauth", createOAuthRoutes());

// Webhook endpoint
app.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("linear-signature");
  const delivery = c.req.header("linear-delivery");

  if (!signature) {
    return c.json({ error: "Missing signature" }, 401);
  }

  if (
    !verifyWebhookSignature(rawBody, signature, config.LINEAR_WEBHOOK_SECRET)
  ) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const raw = parsed as Record<string, unknown>;
  store.insertRawWebhook(
    delivery ?? null,
    typeof raw.type === "string" ? raw.type : null,
    typeof raw.action === "string" ? raw.action : null,
    rawBody,
  );

  if (raw.type === "AppUserNotification") {
    const action = raw.action as string;
    const notification = raw.notification as
      | Record<string, unknown>
      | undefined;
    const orgId = raw.organizationId as string;
    const issueId = (notification?.issueId ??
      (notification?.issue as Record<string, unknown>)?.id) as
      | string
      | undefined;

    if (action === "issueUnassignedFromYou" && issueId) {
      bridge.handleUnassigned(issueId, orgId).catch(console.error);
      return c.json({ status: "ok" });
    }

    if (action === "issueAssignedToYou" && issueId) {
      return c.json({ status: "ok" });
    }

    return c.json({ status: "ignored" });
  }

  if (
    raw.type !== "AgentSessionEvent" ||
    !raw.agentSession ||
    typeof (raw.agentSession as Record<string, unknown>).id !== "string"
  ) {
    return c.json({ status: "ignored" });
  }

  const webhook = parsed as AgentSessionEventWebhook;
  const result = processWebhook(webhook, config, store, delivery ?? null);

  if (result.status === "ok" && result.sessionId) {
    bridge.processSession(result.sessionId).catch(console.error);
  }

  return c.json({ status: result.status });
});

// Auth middleware for internal API endpoints
const apiToken = config.API_TOKEN;
if (apiToken) {
  app.use("/api/*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (!auth || auth !== `Bearer ${apiToken}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });
}

// API endpoints (protected if API_TOKEN is set)
app.get("/api/sessions", (c) => {
  return c.json({ sessions: store.listSessions() });
});

app.get("/api/sessions/:id", (c) => {
  const id = c.req.param("id");
  const session = store.getSession(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({
    session,
    events: store.getSessionEvents(id, 50),
    pendingOutbound: store.getPendingOutboundActivities(id).length,
    piActive: piSessionManager.hasActiveSession(id),
  });
});

app.get("/api/tokens", (c) => {
  const token = store.getFirstToken();
  return c.json({
    hasToken: !!token,
    organizationId: token?.organization_id ?? null,
  });
});

// Graceful shutdown
async function shutdown() {
  await bridge.shutdown();
  store.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

serve(
  {
    fetch: app.fetch,
    port: config.PORT,
    hostname: config.HOST,
  },
  (info) => {
    console.log(
      `Linear bridge server running on http://${info.address}:${info.port}`,
    );
  },
);
