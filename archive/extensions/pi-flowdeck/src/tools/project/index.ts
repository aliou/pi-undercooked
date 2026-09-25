import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { buildProjectArgs } from "../args";
import {
  buildCommandField,
  buildErrorBody,
  buildExpandFooter,
  buildField,
  buildPartialBody,
  buildStatusLine,
  containerWith,
  FlowDeckActionHeader,
  FlowDeckToolLayout,
} from "../components";
import { createClient } from "../create-client";
import { ProjectParams } from "../schema";
import { hasResult, makeToolResult, type ToolDetails } from "../utils";

export default async function projectExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_project",
      label: "FlowDeck Project",
      description:
        "Discover project structure, list schemes and build configs, manage Swift packages, and sync provisioning profiles.",
      promptSnippet: "Discover Xcode project structure, schemes, packages",
      promptGuidelines: [
        "Use flowdeck_project with action context to discover workspace, schemes, and simulators when project structure is unknown.",
        "Use flowdeck_project with action schemes or configs to list available schemes or build configurations.",
        "Use flowdeck_project with action packages_resolve, packages_update, or packages_clear to fix SPM package resolution issues.",
        "Use flowdeck_project with action packages_add, packages_remove, packages_link, or packages_unlink to change Swift package dependencies instead of editing project files by hand.",
        "Use flowdeck_project with action packages_targets to list targets before linking package products.",
        "Use flowdeck_project with action sync_profiles to refresh provisioning profiles.",
      ],
      parameters: ProjectParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const args = buildProjectArgs(params);
        const result = await client.runCommand(args, { cwd: ctx.cwd, signal });
        return makeToolResult(params.action, result, onUpdate);
      },
      renderCall(args, theme) {
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("project", args.action, theme),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(buildPartialBody("project", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("project", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeProject(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildProjectFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeProject(action: string, result: { data?: unknown }): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "context":
      return "Project context discovered";
    case "schemes":
      return `${(Array.isArray(data?.schemes) ? data.schemes : []).length} scheme(s) found`;
    case "configs":
      return `${(Array.isArray(data?.configurations) ? data.configurations : []).length} config(s) found`;
    case "packages_resolve":
      return "Packages resolved";
    case "packages_update":
      return "Packages updated";
    case "packages_clear":
      return "Package cache cleared";
    case "packages_list":
      return "Packages listed";
    case "packages_add":
      return "Package added";
    case "packages_remove":
      return "Package removed";
    case "packages_link":
      return "Package products linked";
    case "packages_unlink":
      return "Package products unlinked";
    case "packages_targets":
      return "Targets listed";
    case "sync_profiles":
      return "Profiles synced";
    case "create":
      return "Project created";
    default:
      return "Completed";
  }
}

function buildProjectFields(
  _action: string,
  result: { data?: unknown; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;
  if (data?.workspace)
    container.addChild(
      buildField("workspace", String(data.workspace), theme, {
        valueTone: "success",
      }),
    );
  if (Array.isArray(data?.schemes)) {
    for (const s of data.schemes.slice(0, 10))
      container.addChild(buildField("scheme", String(s), theme));
    if (data.schemes.length > 10)
      container.addChild(
        buildField("", `...and ${data.schemes.length - 10} more`, theme),
      );
  }
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
