import type { LinearClient } from "@linear/sdk";

interface TeamEntry {
  id: string;
  key: string;
  name: string;
}

const cachedTeamsByWorkspace = new Map<string, TeamEntry[]>();

export interface LinearTeamConfiguration {
  activeWorkspace?: string;
  defaultTeamKey?: string;
}

let getConfiguration: () => LinearTeamConfiguration = () => ({});

export function configureTeamCache(
  resolver: () => LinearTeamConfiguration,
): void {
  getConfiguration = resolver;
  clearTeamCache();
}

function getCacheKey(workspace?: string): string {
  const activeWorkspace = workspace ?? getConfiguration().activeWorkspace;
  return activeWorkspace ? `workspace:${activeWorkspace}` : "env";
}

/** Clear the team cache (e.g. on client re-init). */
export function clearTeamCache(workspace?: string): void {
  if (workspace) {
    cachedTeamsByWorkspace.delete(getCacheKey(workspace));
    return;
  }
  cachedTeamsByWorkspace.clear();
}

/** Fetch and cache teams for the active workspace. */
async function ensureTeams(
  client: LinearClient,
  workspace?: string,
): Promise<TeamEntry[]> {
  const cacheKey = getCacheKey(workspace);
  const cached = cachedTeamsByWorkspace.get(cacheKey);
  if (cached) return cached;

  const result = await client.teams();
  const teams = result.nodes.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
  }));

  cachedTeamsByWorkspace.set(cacheKey, teams);
  return teams;
}

/**
 * Resolve any team identifier (UUID, key like "GEN", or display name) to a
 * team UUID. Returns undefined if no match is found.
 */
export async function resolveTeamId(
  client: LinearClient,
  teamId?: string,
  teamKey?: string,
  teamName?: string,
  workspace?: string,
): Promise<string | undefined> {
  if (teamId) {
    // Could already be a UUID -- but also accept a key passed as teamId.
    // Try exact UUID first, otherwise search by key/name.
    const teams = await ensureTeams(client, workspace);
    const byId = teams.find((t) => t.id === teamId);
    if (byId) return byId.id;
    // Fallback: maybe the caller passed a key like "GEN" as teamId.
    const byKey = teams.find(
      (t) => t.key.toLowerCase() === teamId.toLowerCase(),
    );
    if (byKey) return byKey.id;
    // Last resort: return as-is and let the API validate.
    return teamId;
  }

  const teams = await ensureTeams(client, workspace);

  if (teamKey) {
    return teams.find((t) => t.key.toLowerCase() === teamKey.toLowerCase())?.id;
  }

  if (teamName) {
    return teams.find((t) => t.name.toLowerCase() === teamName.toLowerCase())
      ?.id;
  }

  const defaultTeamKey = getConfiguration().defaultTeamKey;
  if (defaultTeamKey) {
    return teams.find(
      (t) => t.key.toLowerCase() === defaultTeamKey.toLowerCase(),
    )?.id;
  }

  return undefined;
}
