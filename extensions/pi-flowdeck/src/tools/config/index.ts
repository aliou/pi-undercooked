import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { buildConfigArgs } from "../args";
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
import { ConfigParams } from "../schema";
import { hasResult, makeToolResult, type ToolDetails } from "../utils";

export default async function configExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_config",
      label: "FlowDeck Config",
      description:
        "Check, save, or reset FlowDeck project settings. Always check config before running build/run/test commands.",
      promptSnippet: "Check or save FlowDeck project settings",
      promptGuidelines: [
        "Use flowdeck_config with action get before any build/run/test to check for saved settings.",
        "Use flowdeck_config with action set to save workspace, scheme, and simulator when no config exists.",
        "Never use flowdeck_config with action set and force=true unless the user explicitly asks to overwrite.",
        "Never use flowdeck_config with action reset unless the user explicitly asks to clear settings.",
      ],
      parameters: ConfigParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const args = buildConfigArgs(params);
        const result = await client.runCommand(args, { cwd: ctx.cwd, signal });
        return makeToolResult(params.action, result, onUpdate);
      },
      renderCall(args, theme) {
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("config", args.action, theme),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(buildPartialBody("config", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("config", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeConfig(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildConfigFields(fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeConfig(action: string, result: { data?: unknown }): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "get": {
      if (!data || data.message === "No saved config found")
        return "No saved config found";
      const sim =
        typeof data.simulator === "string"
          ? data.simulator
          : typeof data.simulator === "object" && data.simulator
            ? ((data.simulator as Record<string, unknown>).name ??
              (data.simulator as Record<string, unknown>).udid ??
              JSON.stringify(data.simulator))
            : typeof data.device === "string"
              ? data.device
              : "unknown";
      return `Config: ${data.scheme ?? "unknown"} on ${sim}`;
    }
    case "set":
      return "Config saved";
    case "reset":
      return "Config cleared";
    default:
      return "Completed";
  }
}

function buildConfigFields(
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
  if (data?.scheme)
    container.addChild(buildField("scheme", String(data.scheme), theme));
  if (data?.simulator) {
    const simLabel: string =
      typeof data.simulator === "string"
        ? String(data.simulator)
        : String(
            (data.simulator as Record<string, unknown>).name ??
              (data.simulator as Record<string, unknown>).udid ??
              JSON.stringify(data.simulator),
          );
    container.addChild(buildField("simulator", simLabel, theme));
  }
  if (data?.device)
    container.addChild(buildField("device", String(data.device), theme));
  if (data?.configuration)
    container.addChild(
      buildField("configuration", String(data.configuration), theme),
    );
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
