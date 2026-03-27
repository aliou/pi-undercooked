FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build UI and server
RUN pnpm build:ui && pnpm build:server

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY .env.schema env.d.ts ./
COPY src/server/system-prompt.txt ./dist/server/system-prompt.txt

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV DB_PATH=/app/data/linear-bridge.db

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
