import type { LinearClient } from "@linear/sdk";
import { serializeProjectRelation } from "../milestone-serialize";
import type { SerializedProjectRelation } from "../milestone-types";

export interface ListProjectRelationsParams {
  id?: string;
}

export interface ListProjectRelationsResult {
  relations?: SerializedProjectRelation[];
  error?: string;
}

export async function listProjectRelations(
  client: LinearClient,
  params: ListProjectRelationsParams,
): Promise<ListProjectRelationsResult> {
  if (!params.id) {
    return { error: "id is required to list project relations." };
  }

  try {
    const project = await client.project(params.id);
    const relations = await project.relations();
    return {
      relations: await Promise.all(
        relations.nodes.map((relation) => serializeProjectRelation(relation)),
      ),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
