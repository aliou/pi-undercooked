# Pi Linear Bridge

A self-contained Hono HTTP server that bridges [Linear Agent Sessions](https://linear.app/developers/agents) to in-process Pi SDK sessions. When Linear dispatches work to the agent, this bridge creates a Pi session, streams bidirectional events, and posts activity updates back to Linear.

## Architecture

```
Linear (webhooks)
    |
    v
Hono server (single process)
    |--- /oauth/*        OAuth install flow
    |--- /webhook        Linear webhook ingress (fast-ack, async processing)
    |--- /api/*          Dashboard data endpoints
    |--- /*              Serve React SPA (Vite build output)
    |
    |--- Pi SDK session manager (one in-process AgentSession per Linear session)
    |--- SQLite (tokens, sessions, events, checkpoints, activity log)
    |
    v
Linear GraphQL API (create activities, update sessions)
```

## Setup

### 1. Configure environment

```bash
cp .env.schema .env
# Fill in LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET, LINEAR_WEBHOOK_SECRET, and BASE_URL
```

### 2. Install and run (development)

```bash
pnpm install
pnpm dev
```

This starts the Hono server on port 3000 and the Vite dev server on port 5173 with proxy forwarding.

The bridge automatically loads the `git:github.com/aliou/pi-linear` Pi extension for each agent session so the agent has extra Linear-specific tools available during issue work.

A newly assigned task is turned into the initial Pi user prompt using Linear webhook data. The bridge includes `promptContext`, issue metadata, issue description, project context when the issue belongs to a Linear project, the assignment comment body, optional guidance, and direct prompted text when available.

Project context is fetched live from Linear using the installed workspace OAuth token and currently includes only the project name, description, and resources. Resources are derived from the project's external links and documents.

### 3. Install in Linear

Visit `http://localhost:3000/oauth/authorize` (or your public `BASE_URL`) to start the OAuth flow. This installs the app into your Linear workspace with `actor=app` scoping.

### 4. Configure webhook

In your Linear app settings, set the webhook URL to `<BASE_URL>/webhook` and subscribe to `AgentSessionEvent`.

## Docker

### Basic

```bash
docker compose up --build
```

### With Tailscale Funnel

For local development, you need a public HTTPS URL for Linear webhooks. The compose
file includes an opt-in Tailscale Funnel setup with a Caddy reverse proxy that:
- Exposes `/webhook`, `/oauth/*`, `/api/*`, `/health` publicly for Linear integration
- Protects the dashboard (`/*`) with HTTP Basic Auth

**Prerequisites:**

1. Generate a reusable auth key in the [Tailscale admin console](https://login.tailscale.com/admin/settings/keys). A tagged key is recommended.
2. Enable Funnel for the node or tag in your [Tailscale ACL policy](https://tailscale.com/kb/1223/funnel#tailnet-policy-file).
3. Generate a password hash for the dashboard:
   ```bash
   docker run --rm caddy:2-alpine caddy hash-password
   ```
4. Add to your `.env`:
   ```
   TS_AUTHKEY=tskey-auth-...
   TS_HOSTNAME=pi-linear-bridge
   TS_CERT_DOMAIN=pi-linear-bridge.<your-tailnet>.ts.net
   BASE_URL=https://pi-linear-bridge.<your-tailnet>.ts.net
   DASHBOARD_USER=admin
   DASHBOARD_HASH=<bcrypt-hash-from-step-3>
   ```

**Run:**

```bash
docker compose --profile tailscale up --build
```

The public URL will be `https://<TS_HOSTNAME>.<your-tailnet>.ts.net`. Use this as
your `BASE_URL` and Linear webhook URL.

**Access the dashboard:**
Open the public URL in a browser and authenticate with the `DASHBOARD_USER` and password.

You can also use any other tunneling tool (ngrok, bore, etc.) pointing to port 3000
without the tailscale profile.
## Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/oauth/authorize` | Redirect to Linear OAuth |
| `GET` | `/oauth/callback` | Exchange code for token, store in SQLite |
| `POST` | `/oauth/revoke` | Revoke stored token |
| `POST` | `/webhook` | Verify HMAC-SHA256, dedupe, persist, enqueue, return 200 |
| `GET` | `/health` | Health/readiness check |
| `GET` | `/api/sessions` | List sessions with status |
| `GET` | `/api/sessions/:id` | Session detail with recent events |
| `GET` | `/api/tokens` | Check if an OAuth token is installed |
| `GET` | `/*` | Serve React dashboard SPA |

## How it works

### Webhook processing

1. Linear sends a webhook to `/webhook`.
2. The server verifies the HMAC-SHA256 signature, deduplicates by webhook ID, persists the event to SQLite, and returns 200 immediately (fast-ack, satisfies Linear's 5-second SLA).
3. An async worker picks up the event and routes it to the appropriate handler.

### Session lifecycle

- `AgentSessionEvent.created`: Emits an immediate `thought` activity to Linear (within 10 seconds), spawns a Pi session, and sends the initial prompt.
- The initial prompt includes Linear `promptContext`, issue identifier/title/team/URL, issue description when present, project context when the issue has an associated project, the assignment comment body, optional guidance, and any direct prompted body text.
- Project context is injected as a structured `<projectContext>` block containing the project name, optional description, and resources from project external links and documents.
- If Pi ends without a usable assistant response and reports an assistant-side error instead, the bridge emits a Linear `error` activity rather than echoing the initial prompt back as the final response.
- `AgentSessionEvent.prompted`: Routes to Pi `steer` (if running), `abort` (if stop signal), or `follow_up` (if continuing after completion).

### Reliability

- Per-session single-consumer lock prevents concurrent processing.
- Outbound activities are persisted before posting to Linear, enabling replay on restart.
- Stop requests use a control flag with a timeout fallback for forced terminal confirmation.
- Stale running sessions are reset to `failed` on startup.

## SQLite schema

Five tables: `oauth_tokens`, `sessions`, `webhook_events`, `outbound_activities`, `session_events`. The database uses WAL mode for concurrent reads during writes. See `src/server/session-store.ts` for the full schema.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LINEAR_CLIENT_ID` | yes | | OAuth app client ID |
| `LINEAR_CLIENT_SECRET` | yes | | OAuth app client secret |
| `LINEAR_WEBHOOK_SECRET` | yes | | Webhook HMAC-SHA256 secret |
| `BASE_URL` | yes | | Public URL for OAuth redirects and webhook |
| `PORT` | no | `3000` | Server port |
| `HOST` | no | `0.0.0.0` | Server bind address |
| `DB_PATH` | no | `data/linear-bridge.db` | SQLite database path |
| `STOP_WAIT_TIMEOUT_MS` | no | `15000` | Timeout before forced stop confirmation |
| `GRAPHQL_MAX_RETRIES` | no | `5` | Max retries for Linear GraphQL calls |
| `GRAPHQL_BASE_DELAY_MS` | no | `250` | Base delay for exponential backoff |
| `GRAPHQL_MAX_DELAY_MS` | no | `5000` | Max delay cap for backoff |

Docker images include `git` and `ca-certificates` so the bridge can fetch `git:github.com/aliou/pi-linear` at runtime.

## Build

```bash
pnpm build          # Build both UI and server
pnpm build:server   # Server only (tsup -> dist/server/)
pnpm build:ui       # UI only (vite -> dist/ui/)
```

## Reference

- [Linear Agent docs](https://linear.app/developers/agents)
- [Pi SDK docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
