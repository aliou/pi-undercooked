import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { buildRunArgs } from "../args";
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
import { RunParams } from "../schema";
import {
  hasResult,
  makeCustomToolResult,
  makeToolResult,
  type ToolDetails,
} from "../utils";

export default async function runExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_run",
      label: "FlowDeck Run",
      description:
        "Run apps, list running apps, stream logs, stop apps, or uninstall apps. Manages the full app lifecycle.",
      promptSnippet: "Run apps, stream logs, stop apps, list running apps",
      promptGuidelines: [
        "Use flowdeck_run with action run to launch apps on simulator or device instead of xcodebuild or open.",
        "Use flowdeck_run with action apps and showAll=true to list launched apps. Apps with status=unknown are running but not actively monitored by FlowDeck.",
        "Use flowdeck_run with action logs to stream app logs. Never use xcrun simctl log, log show, or log stream.",
        "Use flowdeck_run with action stop to stop running apps.",
      ],
      parameters: RunParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const args = buildRunArgs(params);
        const timeout =
          params.action === "logs"
            ? 300_000
            : params.action === "run"
              ? 120_000
              : undefined;
        const result = await client.runCommand(args, {
          cwd: ctx.cwd,
          signal,
          timeout,
        });

        // Enhance run results with context about the running app
        if (params.action === "run" && result.ok && result.data) {
          const data = result.data as Record<string, unknown>;
          if (data.stage === "RUNNING" || data.operation === "LAUNCH") {
            const text = [
              "App launched and running.",
              data.bundleId ? `Bundle: ${data.bundleId}` : "",
              data.targetName ? `Target: ${data.targetName}` : "",
              data.appPid ? `PID: ${data.appPid}` : "",
              data.scheme ? `Scheme: ${data.scheme}` : "",
              "",
              "Use flowdeck_run action=apps with showAll=true to see the app (status=unknown means launched but not actively monitored).",
              "Use flowdeck_run action=stop to stop it.",
            ]
              .filter(Boolean)
              .join("\n");
            return makeCustomToolResult(
              [{ type: "text" as const, text }],
              { action: params.action, result },
              onUpdate,
            );
          }
        }

        return makeToolResult(params.action, result, onUpdate);
      },
      renderCall(args, theme) {
        const suffix =
          args.action === "run" && args.simulator
            ? theme.fg("accent", `\`${args.simulator}\``)
            : args.action === "logs" && args.identifier
              ? theme.fg("accent", `\`${args.identifier}\``)
              : undefined;

        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("run", args.action, theme, { suffix }),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );

        if (options.isPartial) {
          return layout.setBody(buildPartialBody("run", undefined, theme));
        }

        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("run", theme));
        }

        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeRunSuccess(details.action, fdResult);

        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }

        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildRunFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeRunSuccess(
  action: string,
  result: { data?: unknown; durationMs?: number },
): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "run": {
      const app = data?.appId ?? data?.bundleId ?? "app";
      const target = data?.target ?? data?.simulator ?? "";
      const duration = result.durationMs
        ? ` - ${(result.durationMs / 1000).toFixed(1)}s`
        : "";
      return `Launched ${app}${target ? ` on ${target}` : ""}${duration}`;
    }
    case "apps": {
      const apps = Array.isArray(data?.apps) ? data.apps : [];
      const running = apps.filter(
        (a: Record<string, unknown>) => a.status === "running",
      ).length;
      return `${formatCount(apps.length, "app")} - ${formatCount(running, "running")}`;
    }
    case "stop":
      return "App stopped";
    case "uninstall":
      return "App uninstalled";
    case "logs":
      return "Log streaming started";
    default:
      return "Completed";
  }
}

function buildRunFields(
  action: string,
  result: { data?: unknown; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;
  if (action === "run") {
    if (data?.appId)
      container.addChild(
        buildField("appId", String(data.appId), theme, {
          valueTone: "success",
        }),
      );
    if (data?.bundleId)
      container.addChild(buildField("bundleId", String(data.bundleId), theme));
    if (data?.target)
      container.addChild(buildField("target", String(data.target), theme));
    if (data?.pid)
      container.addChild(buildField("pid", Number(data.pid), theme));
  }
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
