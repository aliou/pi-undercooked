import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Component, Spacer, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { getLinearClient, LINEAR_CREDENTIALS_ERROR } from "../../client";
import { prepareToolText } from "../output";
import { type ListTeamsParams, listTeams } from "./actions/list";
import type { SerializedTeam } from "./types";

const COLLAPSED_MAX = 5;

const TeamsParams = Type.Object({
  action: StringEnum(["list"], {
    description: "Action to perform: list teams.",
  }),
  limit: Type.Optional(
    Type.Number({ description: "Maximum teams to return." }),
  ),
});

type TeamsParamsType = Static<typeof TeamsParams>;

interface TeamsDetails {
  action: string;
  teams?: SerializedTeam[];
  error?: string;
}

type ExecuteResult = AgentToolResult<TeamsDetails>;
const CONTENT_MAX = 20;

function formatTeamForContent(team: SerializedTeam): string {
  const parts = [
    `${team.key} ${team.name} (id=${team.id})`,
    `issues=${team.issueCount}`,
    `timezone=${team.timezone}`,
  ];
  if (team.description) parts.push(`description=${team.description}`);
  return parts.join(" | ");
}

function formatTeamListContent(teams: SerializedTeam[]): string {
  const header = `Listed ${teams.length} teams.`;
  if (teams.length === 0) return header;

  const lines = teams
    .slice(0, CONTENT_MAX)
    .map((team) => `- ${formatTeamForContent(team)}`);
  if (teams.length > CONTENT_MAX) {
    lines.push(`- + ${teams.length - CONTENT_MAX} more`);
  }
  return `${header}\n${lines.join("\n")}`;
}

function renderTeamOneLiner(team: SerializedTeam, theme: Theme): Text {
  const parts = [
    theme.fg("accent", theme.bold(team.key)),
    team.name,
    `${team.issueCount} issues`,
  ];
  return new Text(parts.join(theme.fg("dim", " | ")), 0, 0);
}

function renderTeamListItem(team: SerializedTeam, theme: Theme): Text {
  const line1 = `${theme.fg("accent", theme.bold(team.key))} ${team.name}`;
  const meta = [
    `${theme.fg("muted", "Issues: ")}${team.issueCount}`,
    `${theme.fg("muted", "Timezone: ")}${team.timezone}`,
  ];
  if (team.description) {
    meta.push(`${theme.fg("muted", "Description: ")}${team.description}`);
  }
  return new Text(`${line1}\n${meta.join(theme.fg("dim", " | "))}`, 0, 0);
}

export function registerTeamsTool(pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "linear_teams",
      label: "Linear: Teams",
      description: "List active Linear teams in the workspace.",
      promptSnippet:
        "Use linear_teams to list all active teams in the Linear workspace and discover their IDs and keys.",
      parameters: TeamsParams,
      executionMode: "sequential",

      async execute(
        _toolCallId: string,
        params: TeamsParamsType,
        _signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<TeamsDetails> | undefined,
        _ctx: ExtensionContext,
      ): Promise<ExecuteResult> {
        const client = getLinearClient();
        if (!client) {
          return {
            content: [{ type: "text", text: LINEAR_CREDENTIALS_ERROR }],
            details: { action: params.action, error: LINEAR_CREDENTIALS_ERROR },
          };
        }

        onUpdate?.({
          content: [{ type: "text", text: "Listing teams..." }],
          details: { action: params.action },
        });

        const result = await listTeams(
          client,
          params as unknown as ListTeamsParams,
        );

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            details: { action: params.action, error: result.error },
          };
        }

        const teams = result.teams as SerializedTeam[];
        return {
          content: [
            {
              type: "text",
              text: await prepareToolText(
                formatTeamListContent(teams),
                "linear_teams",
              ),
            },
          ],
          details: { action: params.action, teams },
        };
      },

      renderCall(_args: TeamsParamsType, theme: Theme) {
        return new ToolCallHeader(
          { toolName: "Linear Teams", action: "List" },
          theme,
        );
      },

      renderResult(
        result: AgentToolResult<TeamsDetails>,
        options: ToolRenderResultOptions,
        theme: Theme,
      ) {
        const { details } = result;

        if (!details) {
          const text = result.content[0];
          return new Text(
            text?.type === "text" && text.text ? text.text : "No result",
            0,
            0,
          );
        }

        if (details.error) {
          return new Text(theme.fg("error", details.error), 0, 0);
        }

        const teams = details.teams ?? [];

        const fields: Array<
          | { label: string; value: string; showCollapsed?: boolean }
          | (Component & { showCollapsed?: boolean })
        > = [];

        if (options.expanded) {
          teams.forEach((team, index) => {
            if (index > 0) fields.push(new Spacer(1));
            fields.push(renderTeamListItem(team, theme));
          });
        } else {
          const collapsedSlice = teams.slice(0, COLLAPSED_MAX);
          for (const team of collapsedSlice) {
            const line = renderTeamOneLiner(team, theme);
            Object.assign(line, { showCollapsed: true });
            fields.push(line);
          }
          if (teams.length > COLLAPSED_MAX) {
            const more = new Text(
              theme.fg("dim", `+ ${teams.length - COLLAPSED_MAX} more`),
              0,
              0,
            );
            Object.assign(more, { showCollapsed: true });
            fields.push(more);
          }
        }

        return new ToolBody(
          {
            fields,
            footer: options.expanded
              ? new ToolFooter(theme, {
                  items: [
                    {
                      value: `${teams.length} team${teams.length === 1 ? "" : "s"}`,
                      tone: "muted",
                    },
                  ],
                })
              : undefined,
            includeSpacerBeforeFooter: fields.length > 0,
          },
          options,
          theme,
        );
      },
    }),
  );
}
