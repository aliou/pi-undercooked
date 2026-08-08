import type { LinearClient } from "@linear/sdk";
import { serializeTeam } from "../serialize";
import type { SerializedTeam } from "../types";

export interface ListTeamsParams {
  limit?: number;
}

export interface ListTeamsResult {
  teams?: SerializedTeam[];
  error?: string;
}

export async function listTeams(
  client: LinearClient,
  params: ListTeamsParams,
): Promise<ListTeamsResult> {
  try {
    const teams = await client.teams({
      first: params.limit ?? 50,
      includeArchived: false,
    });

    return {
      teams: teams.nodes.map((team) => serializeTeam(team)),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
