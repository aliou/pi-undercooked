import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "./app-env";
import type { Config } from "./config";
import { validate } from "./middleware";
import { oauthRevokeSchema } from "./schemas";

/**
 * Derive the base URL from the config or from the request Host header.
 * When BASE_URL is not configured, we infer it from the incoming request,
 * which works transparently behind tunnels and reverse proxies.
 */
function getBaseUrl(c: Context<AppEnv>, config: Config): string {
  if (config.BASE_URL) {
    return config.BASE_URL.replace(/\/$/, "");
  }

  const proto = c.req.header("x-forwarded-proto") ?? "http";
  const host = c.req.header("host") ?? "localhost";
  return `${proto}://${host}`;
}

export function createOAuthRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // In-memory CSRF state tokens (short-lived, cleared on use).
  // In production with multiple instances, use a shared store.
  const pendingStates = new Map<string, number>();

  app.get("/authorize", (c) => {
    const config = c.get("config");
    const baseUrl = getBaseUrl(c, config);
    const state = randomBytes(16).toString("hex");
    pendingStates.set(state, Date.now());

    // Clean old states (> 10 minutes)
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [s, ts] of pendingStates) {
      if (ts < cutoff) pendingStates.delete(s);
    }

    const params = new URLSearchParams({
      client_id: config.LINEAR_CLIENT_ID,
      redirect_uri: `${baseUrl}/oauth/callback`,
      response_type: "code",
      state,
      actor: "app",
      scope: "app:assignable,app:mentionable,read,write",
    });

    return c.redirect(
      `https://linear.app/oauth/authorize?${params.toString()}`,
    );
  });

  app.get("/callback", async (c) => {
    const config = c.get("config");
    const store = c.get("store");
    const baseUrl = getBaseUrl(c, config);

    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.json({ error: `OAuth error: ${error}` }, 400);
    }

    if (!code || !state) {
      return c.json({ error: "Missing code or state parameter" }, 400);
    }

    if (!pendingStates.has(state)) {
      return c.json({ error: "Invalid or expired state parameter" }, 400);
    }
    pendingStates.delete(state);

    // Exchange code for token
    const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${baseUrl}/oauth/callback`,
        client_id: config.LINEAR_CLIENT_ID,
        client_secret: config.LINEAR_CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, body);
      return c.json({ error: "Token exchange failed" }, 502);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in?: number;
      scope?: string;
    };

    // Fetch organization ID from token
    const orgResponse = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "{ organization { id name } }",
      }),
    });

    if (!orgResponse.ok) {
      return c.json({ error: "Failed to fetch organization info" }, 502);
    }

    const orgData = (await orgResponse.json()) as {
      data?: { organization?: { id: string; name?: string } };
    };
    const orgId = orgData.data?.organization?.id;
    if (!orgId) {
      return c.json({ error: "Could not determine organization ID" }, 502);
    }

    const expiresAt = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null;

    store.upsertToken(
      orgId,
      tokenData.access_token,
      tokenData.refresh_token ?? null,
      tokenData.scope ?? null,
      expiresAt,
    );

    console.log(
      `OAuth token stored for organization ${orgId} (${orgData.data?.organization?.name ?? "unknown"})`,
    );

    return c.json({
      success: true,
      organizationId: orgId,
      organizationName: orgData.data?.organization?.name,
    });
  });

  app.post(
    "/revoke",
    validate({ target: "json", schema: oauthRevokeSchema }),
    async (c) => {
      const store = c.get("store");
      const body = c.get("validatedBody") as { organizationId: string };

      store.revokeToken(body.organizationId);
      console.log(
        `OAuth token revoked for organization ${body.organizationId}`,
      );

      return c.json({ success: true });
    },
  );

  return app;
}
