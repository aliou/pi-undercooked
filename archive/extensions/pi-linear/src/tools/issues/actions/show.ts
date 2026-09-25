import type { LinearClient } from "@linear/sdk";
import { serializeIssue } from "../serialize";
import type { SerializedIssue } from "../types";

export interface ShowIssueParams {
  id: string;
}

export interface ShowIssueResult {
  issue?: SerializedIssue;
  children?: SerializedIssue[];
  error?: string;
}

export async function showIssue(
  client: LinearClient,
  params: ShowIssueParams,
): Promise<ShowIssueResult> {
  if (!params.id) {
    return { error: "id is required to show an issue." };
  }

  try {
    const issue = await client.issue(params.id);

    const childrenConnection = await issue.children();
    const children = await Promise.all(
      childrenConnection.nodes.map((child) => serializeIssue(child)),
    );

    return {
      issue: await serializeIssue(issue),
      children: children.length > 0 ? children : undefined,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
