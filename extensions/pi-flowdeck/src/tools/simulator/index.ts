import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { buildSimulatorArgs } from "../args";
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
import { SimulatorParams } from "../schema";
import { hasResult, makeToolResult, type ToolDetails } from "../utils";

export default async function simulatorExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_simulator",
      label: "FlowDeck Simulator",
      description:
        "Manage iOS, tvOS, watchOS, and visionOS simulators: list, create, boot, shutdown, erase, clone, runtimes, plus device state such as appearance, orientation, Dynamic Type, language, status bar, location, pasteboard, privacy permissions, push notifications, installed apps, and video recording. Replaces xcrun simctl.",
      promptSnippet:
        "Manage Apple simulators, runtimes, and simulator device state",
      promptGuidelines: [
        "Use flowdeck_simulator instead of xcrun simctl for all simulator operations.",
        "Use flowdeck_simulator with action list to check simulator state before running or booting.",
        "Use flowdeck_simulator with action create to create new simulators when needed.",
        "Use flowdeck_simulator with action runtime_available and runtime_install to install missing runtimes.",
        "Use flowdeck_simulator with action appearance_set, content_size_set, orientation_set, or language_set to test light/dark mode, Dynamic Type, rotation, and localization.",
        "Use flowdeck_simulator with action status_bar_override before capturing marketing or comparison screenshots.",
        "Use flowdeck_simulator with action privacy to grant or reset permissions instead of tapping through system alerts.",
        "Never erase or delete a simulator without explicit user confirmation.",
      ],
      parameters: SimulatorParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const args = buildSimulatorArgs(params);
        const result = await client.runCommand(args, {
          cwd: ctx.cwd,
          signal,
          // Runtime downloads and video recording run far past the default.
          timeout: params.action.startsWith("runtime_")
            ? 1_800_000
            : params.action === "record"
              ? 600_000
              : undefined,
        });
        return makeToolResult(params.action, result, onUpdate);
      },
      renderCall(args, theme) {
        const target = args.name ?? args.udid ?? args.simulator;
        const suffix = target ? theme.fg("accent", `\`${target}\``) : undefined;
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("simulator", args.action, theme, { suffix }),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(
            buildPartialBody("simulator", undefined, theme),
          );
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("simulator", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeSim(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildSimFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeSim(action: string, result: { data?: unknown }): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "list": {
      const sims = Array.isArray(data?.simulators) ? data.simulators : [];
      const booted = sims.filter(
        (s: Record<string, unknown>) => s.state === "Booted",
      ).length;
      return `${formatCount(sims.length, "simulator")} - ${formatCount(booted, "booted")}`;
    }
    case "boot":
      return `Booted ${data?.name ?? "simulator"}`;
    case "shutdown":
      return `Shut down ${data?.name ?? "simulator"}`;
    case "create":
      return "Simulator created";
    case "delete":
      return "Simulator deleted";
    case "erase":
      return "Simulator erased";
    case "clone":
      return "Simulator cloned";
    case "runtime_list":
      return `${formatCount(Array.isArray(data?.runtimes) ? data.runtimes.length : 0, "runtime")} installed`;
    case "runtime_available":
      return `${formatCount(Array.isArray(data?.runtimes) ? data.runtimes.length : 0, "runtime")} available`;
    case "runtime_install":
      return "Runtime installed";
    case "runtime_delete":
      return "Runtime deleted";
    case "prune":
      return "Pruned unused simulators";
    case "launch":
      return `Launched ${data?.bundleId ?? "app"}`;
    case "list_apps":
      return `${formatCount(Array.isArray(data?.apps) ? data.apps.length : 0, "app")} installed`;
    case "app_container":
      return String(data?.path ?? data?.container ?? "Container resolved");
    case "app_info":
      return "App info retrieved";
    case "record":
      return `Recording saved${data?.path ? ` to ${data.path}` : ""}`;
    case "appearance_get":
    case "appearance_set":
    case "appearance_reset":
      return `Appearance: ${data?.appearance ?? "updated"}`;
    case "orientation_get":
    case "orientation_set":
      return `Orientation: ${data?.orientation ?? "updated"}`;
    case "content_size_get":
    case "content_size_set":
    case "content_size_reset":
      return `Content size: ${data?.contentSize ?? data?.contentSizeCategory ?? "updated"}`;
    case "language_get":
    case "language_set":
    case "language_reset":
      return `Language: ${data?.language ?? "updated"}${data?.locale ? ` (${data.locale})` : ""}`;
    case "status_bar_list":
      return "Status bar overrides listed";
    case "status_bar_override":
      return "Status bar overridden";
    case "status_bar_clear":
      return "Status bar overrides cleared";
    case "location_set":
      return `Location set${data?.coordinates ? ` to ${data.coordinates}` : ""}`;
    case "location_clear":
      return "Location override cleared";
    case "pasteboard_get":
      return "Pasteboard read";
    case "pasteboard_set":
      return "Pasteboard set";
    case "pasteboard_clear":
      return "Pasteboard cleared";
    case "privacy":
      return `Privacy ${data?.action ?? "updated"} for ${data?.service ?? "service"}`;
    case "push":
      return "Push notification delivered";
    default:
      return "Completed";
  }
}

function buildSimFields(
  action: string,
  result: { data?: unknown; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;
  if (action === "list" && Array.isArray(data?.simulators)) {
    const sims = data.simulators as Array<Record<string, unknown>>;
    for (const sim of sims.slice(0, 15)) {
      const tone =
        sim.state === "Booted" ? ("success" as const) : ("muted" as const);
      container.addChild(
        buildField(
          String(sim.name ?? sim.udid ?? "unknown"),
          String(sim.state ?? "unknown"),
          theme,
          { valueTone: tone },
        ),
      );
    }
    if (sims.length > 15)
      container.addChild(
        buildField("", `...and ${sims.length - 15} more`, theme),
      );
  } else {
    if (data?.name)
      container.addChild(
        buildField("name", String(data.name), theme, { valueTone: "success" }),
      );
    if (data?.udid)
      container.addChild(buildField("udid", String(data.udid), theme));
    if (data?.state)
      container.addChild(buildField("state", String(data.state), theme));
  }
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
