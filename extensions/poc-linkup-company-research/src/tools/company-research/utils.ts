import { StringEnum } from "@mariozechner/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { type ExtensionAPI, truncateHead } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { getClient, parseDomainList } from "../../client";
import {
  buildPrompt,
  GROUP_DESCRIPTIONS,
  GROUPS,
  getDefaultDepth,
  getStructuredSchema,
} from "../../research";
import type {
  CompanyResearchParams,
  GroupedResearchDetails,
} from "../../types";

function getGroupLabel(group: keyof typeof GROUPS) {
  return `Linkup ${group[0].toUpperCase()}${group.slice(1)}`;
}

function renderGroupedCall(
  group: keyof typeof GROUPS,
  args: CompanyResearchParams,
  theme: Theme,
) {
  const depth = args.depth ?? getDefaultDepth(args.focus);
  const outputFormat = args.output_format ?? "answer";

  let text = theme.fg(
    "toolTitle",
    theme.bold(`${getGroupLabel(group)}: Research `),
  );
  text += theme.fg("accent", args.company_name);
  text += theme.fg("dim", ` (${args.focus}, ${depth}, ${outputFormat})`);

  if (args.from_date || args.to_date) {
    text += `\n${theme.fg("muted", "Date range:")} ${args.from_date ?? "..."} → ${args.to_date ?? "..."}`;
  }

  if (args.max_results) {
    text += `\n${theme.fg("muted", "Max results:")} ${args.max_results}`;
  }

  if (args.include_domains) {
    text += `\n${theme.fg("muted", "Include domains:")} ${args.include_domains}`;
  }

  if (args.exclude_domains) {
    text += `\n${theme.fg("muted", "Exclude domains:")} ${args.exclude_domains}`;
  }

  return new Text(text, 0, 0);
}

function renderGroupedResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
  if (options.isPartial) {
    const text =
      result.content?.[0]?.type === "text"
        ? (result.content[0].text ?? "Researching...")
        : "Researching...";
    return new Text(theme.fg("dim", text), 0, 0);
  }

  const details = result.details as GroupedResearchDetails | undefined;

  if (details?.isError) {
    const errorText =
      result.content?.[0]?.type === "text"
        ? (result.content[0].text ?? "Error")
        : (details.error ?? "Error");
    return new Text(theme.fg("error", errorText), 0, 0);
  }

  const sourcesCount = details?.sourcesCount ?? 0;
  let text = theme.fg("success", `✓ Found ${sourcesCount} source(s)`);

  if (details) {
    text += `\n${theme.fg("muted", "Focus:")} ${details.focus}`;
    text += `\n${theme.fg("muted", "Depth:")} ${details.depth}`;
    text += `\n${theme.fg("muted", "Output:")} ${details.outputFormat}`;
  }

  if (!options.expanded) {
    text += theme.fg("muted", "\n[Ctrl+O to expand]");
    return new Text(text, 0, 0);
  }

  const preview =
    result.content?.[0]?.type === "text" ? (result.content[0].text ?? "") : "";
  if (preview) {
    text += `\n\n${theme.fg("dim", truncateHead(preview, { maxBytes: 900, maxLines: 20 }).content)}`;
  }

  return new Text(text, 0, 0);
}

export function registerGroupedTool(
  pi: ExtensionAPI,
  group: keyof typeof GROUPS,
  toolName: string,
) {
  const allowedFocus = GROUPS[group] as readonly string[];

  const parameters = Type.Object({
    company_name: Type.String({
      description: "Company name to research.",
    }),
    focus: StringEnum(allowedFocus, {
      description: `Specific focus in ${group}.`,
    }),
    output_format: Type.Optional(
      StringEnum(["answer", "structured"] as const, {
        description:
          "Output mode: 'answer' for readable summary, 'structured' for JSON payload.",
      }),
    ),
    depth: Type.Optional(
      StringEnum(["fast", "standard", "deep"] as const, {
        description:
          "Search depth. Defaults based on focus. Use deep for harder research.",
      }),
    ),
    from_date: Type.Optional(
      Type.String({
        description: "Start date filter YYYY-MM-DD.",
      }),
    ),
    to_date: Type.Optional(
      Type.String({
        description: "End date filter YYYY-MM-DD.",
      }),
    ),
    include_domains: Type.Optional(
      Type.String({
        description: "Comma-separated allowlist domains (max 50).",
      }),
    ),
    exclude_domains: Type.Optional(
      Type.String({
        description: "Comma-separated denylist domains (max 50).",
      }),
    ),
    include_images: Type.Optional(
      Type.Boolean({
        description:
          "Include relevant images in Linkup response when available.",
      }),
    ),
    max_results: Type.Optional(
      Type.Number({
        description: "Maximum sources/results to use (1-50).",
        minimum: 1,
        maximum: 50,
      }),
    ),
  });

  const toolDefinition = {
    name: toolName,
    label: `Linkup ${group}`,
    description: `${GROUP_DESCRIPTIONS[group]} Use 'focus' to pick the specific analysis.`,
    promptSnippet: `Research company ${group} using Linkup company research tools.`,
    promptGuidelines: [
      "Prefer these company research tools before generic web research tools for company intelligence tasks.",
      "Pick the tool that matches the requested domain and use focus to narrow the analysis.",
      "Use output_format: answer for human-readable synthesis and structured only when the user explicitly wants structured output.",
      "Use date or domain filters when the user provides a timeframe or preferred sources.",
      "If evidence is thin, follow up with adjacent company research tools before falling back to generic web tools.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: CompanyResearchParams,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<GroupedResearchDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<GroupedResearchDetails>> {
      const client = getClient();
      const typed = params;

      try {
        const outputFormat = typed.output_format ?? "answer";
        const depth = typed.depth ?? getDefaultDepth(typed.focus);

        onUpdate?.({
          content: [
            {
              type: "text",
              text: `Researching ${typed.company_name} (${typed.focus}, ${depth})...`,
            },
          ],
          details: {
            group,
            focus: typed.focus,
            companyName: typed.company_name,
            depth,
            outputFormat,
            sourcesCount: 0,
          },
        });

        const response = await client.search(
          {
            q: buildPrompt(typed),
            depth,
            outputType:
              outputFormat === "structured" ? "structured" : "sourcedAnswer",
            structuredOutputSchema:
              outputFormat === "structured"
                ? JSON.stringify(getStructuredSchema(typed.focus))
                : undefined,
            fromDate: typed.from_date || undefined,
            toDate: typed.to_date || undefined,
            includeDomains: parseDomainList(typed.include_domains),
            excludeDomains: parseDomainList(typed.exclude_domains),
            includeImages: typed.include_images ?? false,
            maxResults: typed.max_results ?? 12,
          },
          signal,
        );

        let text = "";
        if (outputFormat === "structured") {
          text = JSON.stringify(response, null, 2);
        } else {
          text = response.answer ?? "No answer found.";
          if ((response.sources?.length ?? 0) > 0) {
            text += "\n\nSources:\n";
            for (const source of response.sources?.slice(0, 8) ?? []) {
              const label = source.name ?? source.title ?? "Source";
              text += `- ${label}${source.url ? `: ${source.url}` : ""}\n`;
            }
          }
        }

        const details: GroupedResearchDetails = {
          group,
          focus: typed.focus,
          companyName: typed.company_name,
          depth,
          outputFormat,
          sourcesCount: response.sources?.length ?? 0,
        };

        const truncation = truncateHead(text, {
          maxBytes: 50_000,
          maxLines: 2_000,
        });

        return {
          content: [{ type: "text", text: truncation.content }],
          details,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: {
            group,
            focus: typed.focus,
            companyName: typed.company_name,
            depth: typed.depth ?? "standard",
            outputFormat: typed.output_format ?? "answer",
            sourcesCount: 0,
            isError: true,
            error: message,
          } satisfies GroupedResearchDetails,
        };
      }
    },

    renderCall(args: CompanyResearchParams, theme: Theme) {
      return renderGroupedCall(group, args, theme);
    },

    renderResult(
      result: AgentToolResult<GroupedResearchDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      return renderGroupedResult(result, options, theme);
    },
  };

  pi.registerTool(
    toolDefinition as unknown as Parameters<typeof pi.registerTool>[0],
  );
}
