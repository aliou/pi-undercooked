import { StringEnum } from "@mariozechner/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { type ListPeopleParams, listPeople } from "./actions/list";
import type { SerializedPerson } from "./types";

const PeopleParams = Type.Object({
  action: StringEnum(["list"], {
    description: "People action to perform.",
  }),
  limit: Type.Optional(
    Type.Number({ description: "Maximum people to return." }),
  ),
});

type PeopleParamsType = { action: string; [key: string]: unknown };

interface PeopleDetails {
  action: string;
  people?: SerializedPerson[];
  error?: string;
}

export function registerPeopleTool(pi: ExtensionAPI) {
  pi.registerTool<typeof PeopleParams, PeopleDetails>({
    name: "linear_people",
    label: "Linear: People",
    description: "List active people in the Linear workspace.",
    promptSnippet:
      "Use linear_people to list workspace members and resolve assignee IDs before creating or updating issues.",
    parameters: PeopleParams,
    async execute(
      _toolCallId: string,
      params: PeopleParamsType,
      _signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<PeopleDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<PeopleDetails>> {
      const client = getLinearClient();
      if (!client) {
        return {
          content: [{ type: "text", text: LINEAR_CREDENTIALS_ERROR }],
          details: { action: params.action, error: LINEAR_CREDENTIALS_ERROR },
        };
      }

      onUpdate?.({
        content: [{ type: "text", text: "Listing people..." }],
        details: { action: params.action },
      });

      const result = await listPeople(client, {
        limit: typeof params.limit === "number" ? params.limit : undefined,
      } as ListPeopleParams);

      if (result.error) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          details: { action: params.action, error: result.error },
        };
      }

      const text = result.people
        ? `Listed ${result.people.length} people.\n${result.people
            .map(
              (person) =>
                `- ${person.displayName} | id=${person.id}${person.email ? ` | ${person.email}` : ""}`,
            )
            .join("\n")}`
        : "No people found.";

      return {
        content: [{ type: "text", text }],
        details: { action: params.action, people: result.people },
      };
    },
    renderCall(_args: PeopleParamsType, theme: Theme) {
      return new Text(theme.fg("accent", "Linear People: list"), 0, 0);
    },
    renderResult(result) {
      const text = result.content[0];
      return new Text(
        text?.type === "text" && text.text ? text.text : "Done.",
        0,
        0,
      );
    },
  });
}
