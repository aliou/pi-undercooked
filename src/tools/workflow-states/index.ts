import { ToolCallHeader } from "@aliou/pi-utils-ui";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { prepareToolText } from "../output";
import { listWorkflowStates } from "./actions/list";
import type { SerializedWorkflowState } from "./types";

const TeamStatesParams = Type.Object({
  action: StringEnum(["list"], {
    description: "Team state action to perform.",
  }),
  limit: Type.Optional(
    Type.Number({ description: "Maximum states to return." }),
  ),
  teamId: Type.Optional(Type.String({ description: "Team ID." })),
  teamKey: Type.Optional(Type.String({ description: "Team key." })),
});

type TeamStatesParamsType = Static<typeof TeamStatesParams>;

interface TeamStatesDetails {
  action: string;
  states?: SerializedWorkflowState[];
  error?: string;
}

export function registerTeamStatesTool(pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "linear_team_states",
      label: "Linear: Team States",
      description: "List Linear team workflow states.",
      promptSnippet:
        "Use linear_team_states to list workflow states for a Linear team. Useful for resolving state IDs before creating or updating issues.",
      promptGuidelines: [
        "Supply teamKey to linear_team_states to scope results to a specific team.",
      ],
      parameters: TeamStatesParams,
      executionMode: "sequential",
      async execute(
        _toolCallId,
        params,
        _signal,
        onUpdate,
        _ctx,
      ): Promise<AgentToolResult<TeamStatesDetails>> {
        const client = getLinearClient();
        if (!client) {
          return {
            content: [{ type: "text", text: LINEAR_CREDENTIALS_ERROR }],
            details: { action: params.action, error: LINEAR_CREDENTIALS_ERROR },
          };
        }

        onUpdate?.({
          content: [{ type: "text", text: "Listing team states..." }],
          details: { action: params.action },
        });

        const result = await listWorkflowStates(client, {
          limit: typeof params.limit === "number" ? params.limit : undefined,
          teamId: typeof params.teamId === "string" ? params.teamId : undefined,
          teamKey:
            typeof params.teamKey === "string" ? params.teamKey : undefined,
        });

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            details: { action: params.action, error: result.error },
          };
        }

        const text = result.states
          ? `Listed ${result.states.length} team states.\n${result.states
              .map((state) => `- ${state.name} | ${state.type} | ${state.id}`)
              .join("\n")}`
          : "No team states found.";

        return {
          content: [
            {
              type: "text",
              text: await prepareToolText(text, "linear_team_states"),
            },
          ],
          details: { action: params.action, states: result.states },
        };
      },
      renderCall(_args: TeamStatesParamsType, theme: Theme) {
        return new ToolCallHeader(
          { toolName: "Linear Team States", action: "List" },
          theme,
        );
      },
      renderResult(
        result: AgentToolResult<TeamStatesDetails>,
        options: ToolRenderResultOptions,
        theme: Theme,
      ) {
        if (options.isPartial) {
          return new Text(
            theme.fg("muted", "Linear team states running..."),
            0,
            0,
          );
        }
        if (result.details?.error) {
          return new Text(theme.fg("error", result.details.error), 0, 0);
        }
        const text = result.content[0];
        return new Text(
          text?.type === "text" && text.text ? text.text : "Done.",
          0,
          0,
        );
      },
    }),
  );
}
