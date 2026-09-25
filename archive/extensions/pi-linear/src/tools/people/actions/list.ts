import type { LinearClient } from "@linear/sdk";
import type { SerializedPerson } from "../types";

export interface ListPeopleParams {
  limit?: number;
}

export interface ListPeopleResult {
  people?: SerializedPerson[];
  error?: string;
}

export async function listPeople(
  client: LinearClient,
  params: ListPeopleParams,
): Promise<ListPeopleResult> {
  try {
    const users = await client.users({
      first: params.limit ?? 50,
      includeArchived: false,
      filter: { active: { eq: true } },
    });

    return {
      people: users.nodes.map((user) => ({
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        email: user.email ?? undefined,
        active: user.active,
        admin: user.admin,
      })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
