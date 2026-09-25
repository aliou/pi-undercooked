# Linear Integration

## Overview

This integration is a Hono HTTP server that bridges Linear Agent Sessions to in-process Pi SDK sessions. It handles OAuth installation, webhook ingestion, bidirectional event mapping, session persistence, and a small React dashboard for inspection.

Each Linear session maps to one Pi `AgentSession` managed by `pi-session-manager.ts`. Session state, webhook events, outbound activities, and session logs are persisted in SQLite.

The bridge also loads the `git:github.com/aliou/pi-linear` Pi extension for each session so the agent has extra Linear-specific tools available while working on issues.

## Project structure

```text
integrations/linear/
  compose.yml               Docker Compose, optional Tailscale Funnel profile
  Dockerfile                Multi-stage Node.js image with git available at runtime
  .env.schema               Environment schema used to generate env.d.ts
  src/
    server/
      app-env.ts            Shared Hono context variable typing
      index.ts              Hono app, route wiring, startup, shutdown
      config.ts             Env parsing and runtime config defaults
      types.ts              Linear webhook and app row types
      oauth.ts              OAuth authorize/callback/revoke routes
      webhook.ts            HMAC verify, dedupe, normalize, persist helpers
      linear-client.ts      GraphQL mutations with retry + backoff
      pi-session-manager.ts In-process Pi SDK session lifecycle
      pi-bridge.ts          Per-session worker and Linear/Pi event mapping
      session-store.ts      SQLite schema and CRUD helpers
      middleware.ts         Validation middleware using Hono context variables
      system-prompt.txt     System prompt override used for spawned Pi sessions
    ui/
      index.html            SPA entry
      main.tsx              React mount
      App.tsx               Root component
      components/
        Layout.tsx          Header + health indicator
        SessionList.tsx     Polls /api/sessions every 5s
        SessionDetail.tsx   Polls /api/sessions/:id every 2s
```

## Key design decisions

1. Fast webhook ack: verify signature, dedupe, persist to SQLite, return 200. All Pi and GraphQL work happens asynchronously outside the request path.
2. Per-session single-consumer lock: only one worker processes a session at a time.
3. Outbound idempotency: activities are persisted before posting to Linear and can be replayed after restart.
4. Single-terminal invariant: each run emits exactly one terminal activity (`response` or `error`).
5. Stop as control flag: `stop_requested` is checked between processing steps, with a timeout fallback for forced confirmation.
6. Shared Hono context variables: `config`, `store`, and validated request data live on `c.set(...)` / `c.get(...)` instead of being threaded through every handler.

## Initial task prompt

When Linear sends `AgentSessionEvent.created`, the bridge builds the initial Pi user prompt from webhook data. It currently includes:

- `promptContext`
- issue identifier, title, team, and URL
- issue description when present
- assignment comment body when present
- guidance when present
- direct prompted body text when present

The system prompt comes from `src/server/system-prompt.txt`, and Pi also receives the normal project/user resource loading context.

## Development

```bash
pnpm install
pnpm dev           # Starts server (tsx watch) + UI (vite dev) concurrently
pnpm typecheck     # TypeScript check
pnpm lint          # Biome check
```

To create a local `.env`, copy the schema and fill values in:

```bash
cp .env.schema .env
```

## Testing with a public URL

For local development, you need a public HTTPS URL for Linear webhooks. The compose file includes an opt-in Tailscale Funnel setup. See `README.md` for the full setup, or use another tunneling tool pointing to port 3000.

## Common tasks

### Adding a new Pi event mapping

1. Add any new app-level typing needed in `types.ts`.
2. Add a case to the `handlePiEvent` switch in `pi-bridge.ts`.
3. Map the event to the appropriate Linear activity type using `emitActivity`.

### Adding a new API endpoint

1. Add the route in `index.ts`.
2. Read shared services from Hono context with `c.get("config")` or `c.get("store")` when appropriate.
3. Reuse `session-store.ts` for persistence instead of inlining SQL.

### Changing the SQLite schema

1. Update the `SCHEMA_SQL` string in `session-store.ts`.
2. Add corresponding CRUD methods.
3. Update the row types in `types.ts`.

### Changing environment variables

1. Update `.env.schema`.
2. Run `pnpm exec varlock typegen`.
3. Update `config.ts` and `README.md` if the runtime behavior changed.
