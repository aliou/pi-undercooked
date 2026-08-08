/**
 * FlowDeck session state management.
 *
 * Tracks UI automation sessions (iOS simulator + macOS) across the Pi session lifecycle.
 * Uses `pi.appendEntry()` for durable state, with an in-memory registry for fast lookups.
 * Reconstructs from Pi session entries on startup/resume/tree navigation.
 */

export type Platform = "ios" | "mac";

/** A tracked FlowDeck session. */
export interface FlowDeckSession {
  platform: Platform;
  sessionId: string;
  sessionDir: string;
  latestScreenshot: string;
  latestTree: string;
  latest?: string;
  target: string;
  targetKind: "simulator" | "udid" | "app-name" | "bundle-id" | "pid";
  status: "running" | "stopped";
  startedAt: number;
}

/** Shape of entries stored via `pi.appendEntry("flowdeck-session", data)`. */
export type FlowDeckSessionEntry =
  | {
      event: "started";
      platform: Platform;
      sessionId: string;
      sessionDir: string;
      latestScreenshot: string;
      latestTree: string;
      latest?: string;
      target: string;
      targetKind: FlowDeckSession["targetKind"];
      startedAt: number;
    }
  | {
      event: "stopped";
      platform: Platform;
      sessionId: string;
      stoppedAt: number;
      reason?: "user" | "shutdown" | "replaced" | "error";
    }
  | {
      event: "active-set";
      platform: Platform;
      sessionId: string;
      setAt: number;
    };

/** In-memory session registry. */
export interface SessionRegistry {
  sessions: Map<string, FlowDeckSession>;
  activeByPlatform: Record<Platform, string | undefined>;
}

const ENTRY_CUSTOM_TYPE = "flowdeck-session";

export function createEmptyRegistry(): SessionRegistry {
  return {
    sessions: new Map(),
    activeByPlatform: { ios: undefined, mac: undefined },
  };
}

function sessionKey(platform: Platform, sessionId: string): string {
  return `${platform}:${sessionId}`;
}

/** Apply a persisted entry to the registry (state reducer). */
export function applyEntry(
  registry: SessionRegistry,
  entry: FlowDeckSessionEntry,
): void {
  switch (entry.event) {
    case "started": {
      const key = sessionKey(entry.platform, entry.sessionId);
      registry.sessions.set(key, {
        platform: entry.platform,
        sessionId: entry.sessionId,
        sessionDir: entry.sessionDir,
        latestScreenshot: entry.latestScreenshot,
        latestTree: entry.latestTree,
        latest: entry.latest,
        target: entry.target,
        targetKind: entry.targetKind,
        status: "running",
        startedAt: entry.startedAt,
      });
      break;
    }
    case "stopped": {
      const key = sessionKey(entry.platform, entry.sessionId);
      const s = registry.sessions.get(key);
      if (s) s.status = "stopped";
      if (registry.activeByPlatform[entry.platform] === entry.sessionId) {
        registry.activeByPlatform[entry.platform] = undefined;
      }
      break;
    }
    case "active-set": {
      const key = sessionKey(entry.platform, entry.sessionId);
      const s = registry.sessions.get(key);
      if (s && s.status !== "stopped") {
        registry.activeByPlatform[entry.platform] = entry.sessionId;
      }
      break;
    }
  }
}

/** Reconstruct registry from Pi session entries. */
export function reconstructFromEntries(
  entries: Array<{ type: string; customType?: string; data?: unknown }>,
): SessionRegistry {
  const registry = createEmptyRegistry();
  for (const entry of entries) {
    if (
      entry.type === "custom" &&
      entry.customType === ENTRY_CUSTOM_TYPE &&
      entry.data
    ) {
      applyEntry(registry, entry.data as FlowDeckSessionEntry);
    }
  }
  return registry;
}

/** Get the active session for a platform, if any. */
export function getActiveSession(
  registry: SessionRegistry,
  platform: Platform,
): FlowDeckSession | undefined {
  const activeId = registry.activeByPlatform[platform];
  if (!activeId) return undefined;
  return registry.sessions.get(sessionKey(platform, activeId));
}

/** Find a running session matching a target. */
export function findSessionByTarget(
  registry: SessionRegistry,
  platform: Platform,
  target: string,
): FlowDeckSession | undefined {
  for (const session of registry.sessions.values()) {
    if (
      session.platform === platform &&
      session.status === "running" &&
      session.target === target
    ) {
      return session;
    }
  }
  return undefined;
}

/** List all running sessions for a platform. */
export function listRunningSessions(
  registry: SessionRegistry,
  platform?: Platform,
): FlowDeckSession[] {
  const result: FlowDeckSession[] = [];
  for (const session of registry.sessions.values()) {
    if (
      session.status === "running" &&
      (!platform || session.platform === platform)
    ) {
      result.push(session);
    }
  }
  return result;
}

export { ENTRY_CUSTOM_TYPE };
