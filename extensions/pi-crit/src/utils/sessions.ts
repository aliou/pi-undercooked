import { createHash } from "node:crypto";

export interface TrackedSession {
  piSessionId: string;
  cwd: string;
  files: string[];
  critSessionId: string;
}

const trackedSessions = new Map<string, TrackedSession>();
const activeSessionKeyByPiSession = new Map<string, string>();

function normalizeFiles(files: string[] | undefined): string[] {
  if (!files?.length) return [];
  return [...files].sort();
}

export function computeCritSessionId(
  cwd: string,
  files: string[] | undefined,
): string {
  const sorted = normalizeFiles(files);
  const hash = createHash("sha256");
  hash.update(cwd);
  for (const file of sorted) {
    hash.update("\0");
    hash.update(file);
  }
  return hash.digest("hex").slice(0, 12);
}

function piSessionKey(piSessionId: string, cwd: string): string {
  return `${piSessionId}\0${cwd}`;
}

function trackedKey(
  piSessionId: string,
  cwd: string,
  critSessionId: string,
): string {
  return `${piSessionId}\0${cwd}\0${critSessionId}`;
}

export function trackSession(
  piSessionId: string,
  cwd: string,
  files: string[] | undefined,
): TrackedSession {
  const normalizedFiles = normalizeFiles(files);
  const critSessionId = computeCritSessionId(cwd, normalizedFiles);

  const tracked: TrackedSession = {
    piSessionId,
    cwd,
    files: normalizedFiles,
    critSessionId,
  };

  trackedSessions.set(trackedKey(piSessionId, cwd, critSessionId), tracked);
  activeSessionKeyByPiSession.set(
    piSessionKey(piSessionId, cwd),
    critSessionId,
  );

  return tracked;
}

export function getActiveSession(
  piSessionId: string,
  cwd: string,
): TrackedSession | undefined {
  const activeCritSessionId = activeSessionKeyByPiSession.get(
    piSessionKey(piSessionId, cwd),
  );
  if (!activeCritSessionId) return undefined;

  return trackedSessions.get(trackedKey(piSessionId, cwd, activeCritSessionId));
}

export function getTrackedSessionsForPiSession(
  piSessionId: string,
  cwd: string,
): TrackedSession[] {
  const out: TrackedSession[] = [];
  for (const tracked of trackedSessions.values()) {
    if (tracked.piSessionId === piSessionId && tracked.cwd === cwd) {
      out.push(tracked);
    }
  }
  return out;
}
