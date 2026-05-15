import type { LinearClient } from "@linear/sdk";
import { resolveTeamId } from "../../../teams";
import type { SerializedWorkflowState } from "../types";

export interface ListWorkflowStatesParams {
  limit?: number;
  teamId?: string;
  teamKey?: string;
}

export interface ListWorkflowStatesResult {
  states?: SerializedWorkflowState[];
  error?: string;
}

export async function listWorkflowStates(
  client: LinearClient,
  params: ListWorkflowStatesParams,
): Promise<ListWorkflowStatesResult> {
  try {
    const resolvedTeamId =
      params.teamId || params.teamKey
        ? await resolveTeamId(client, params.teamId, params.teamKey, undefined)
        : undefined;

    const filter = resolvedTeamId
      ? { team: { id: { eq: resolvedTeamId } } }
      : undefined;
    const states = await client.workflowStates({
      first: params.limit ?? 50,
      includeArchived: false,
      filter: filter as never,
    });

    return {
      states: await Promise.all(
        states.nodes.map(async (state) => {
          const team = await state.team;
          return {
            id: state.id,
            name: state.name,
            type: state.type,
            color: state.color,
            description: state.description ?? undefined,
            teamId: team?.id ?? "",
            createdAt: state.createdAt.toISOString(),
            updatedAt: state.updatedAt.toISOString(),
          };
        }),
      ),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
