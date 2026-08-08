import type { Team } from "@linear/sdk";
import type { SerializedTeam } from "./types";

/** Convert a Team SDK object into a plain JSON representation. */
export function serializeTeam(team: Team): SerializedTeam {
  return {
    id: team.id,
    key: team.key,
    name: team.name,
    description: team.description ?? undefined,
    icon: team.icon ?? undefined,
    color: team.color ?? undefined,
    timezone: team.timezone,
    issueCount: team.issueCount,
  };
}
