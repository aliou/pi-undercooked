import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { buildDeviceArgs } from "../args";
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
  formatCount,
} from "../components";
import { createClient } from "../create-client";
import { DeviceParams } from "../schema";
import { hasResult, makeToolResult, type ToolDetails } from "../utils";

export default async function deviceExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_device",
      label: "FlowDeck Device",
      description:
        "List physical Apple devices, install/uninstall/launch apps on devices. Requires explicit user confirmation before device operations.",
      promptSnippet: "List and manage physical Apple devices",
      promptGuidelines: [
        "Use flowdeck_device with action list to check connected devices.",
        "Always get explicit user confirmation before running on a physical device.",
        "Use flowdeck_device instead of xcrun devicectl for physical device operations.",
      ],
      parameters: DeviceParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const args = buildDeviceArgs(params);
        const result = await client.runCommand(args, { cwd: ctx.cwd, signal });
        return makeToolResult(params.action, result, onUpdate);
      },
      renderCall(args, theme) {
        const suffix = args.udid
          ? theme.fg("accent", `\`${args.udid}\``)
          : undefined;
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("device", args.action, theme, { suffix }),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(buildPartialBody("device", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("device", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeDevice(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildDeviceFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeDevice(action: string, result: { data?: unknown }): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "list":
      return `${formatCount(Array.isArray(data?.devices) ? data.devices.length : 0, "device")} connected`;
    case "install":
      return "App installed on device";
    case "uninstall":
      return "App uninstalled from device";
    case "launch":
      return "App launched on device";
    default:
      return "Completed";
  }
}

function buildDeviceFields(
  action: string,
  result: { data?: unknown; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;
  if (action === "list" && Array.isArray(data?.devices)) {
    for (const dev of (data.devices as Array<Record<string, unknown>>).slice(
      0,
      10,
    )) {
      container.addChild(
        buildField(
          String(dev.name ?? dev.udid ?? "unknown"),
          String(dev.platform ?? ""),
          theme,
        ),
      );
    }
  } else {
    if (data?.udid)
      container.addChild(buildField("udid", String(data.udid), theme));
    if (data?.name)
      container.addChild(
        buildField("name", String(data.name), theme, { valueTone: "success" }),
      );
  }
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
