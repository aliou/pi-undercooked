import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { buildTestArgs } from "../args";
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
import { TestParams } from "../schema";
import { hasResult, makeToolResult, type ToolDetails } from "../utils";

export default async function testExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_test",
      label: "FlowDeck Test",
      description:
        "Run Xcode tests, discover available tests, and list test plans. Replaces xcodebuild test commands.",
      promptSnippet: "Run Xcode tests, discover tests, list test plans",
      promptGuidelines: [
        "Use flowdeck_test instead of xcodebuild for running tests.",
        "Use flowdeck_test with action discover to list available tests without building.",
        "Use flowdeck_test with action plans to list test plans before running with --plan.",
        "Use flowdeck_test with action test and --only to run specific test classes or methods.",
        "When flowdeck_test fails, read the stderr and stdout sections in the error for the failing assertions before rerunning.",
      ],
      parameters: TestParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const args = buildTestArgs(params);
        const result = await client.runCommand(args, {
          cwd: ctx.cwd,
          signal,
          timeout: 600_000,
        });
        return makeToolResult(params.action, result, onUpdate);
      },
      renderCall(args, theme) {
        const suffix = args.only
          ? theme.fg("accent", `\`${args.only}\``)
          : undefined;
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("test", args.action, theme, { suffix }),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(buildPartialBody("test", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("test", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Tests failed")
            : summarizeTest(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildTestFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeTest(
  action: string,
  result: { data?: unknown; durationMs?: number },
): string {
  const data = result.data as Record<string, unknown> | undefined;
  if (action !== "test")
    return action === "discover" ? "Tests discovered" : "Test plans listed";
  const passed = typeof data?.passedCount === "number" ? data.passedCount : 0;
  const failed = typeof data?.failedCount === "number" ? data.failedCount : 0;
  const duration = result.durationMs
    ? ` - ${(result.durationMs / 1000).toFixed(1)}s`
    : "";
  if (failed > 0)
    return `${formatCount(passed, "passed")} - ${formatCount(failed, "failed")}${duration}`;
  return `${formatCount(passed, "passed")}${duration}`;
}

function buildTestFields(
  action: string,
  result: { data?: unknown; durationMs?: number; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;
  if (action === "test") {
    if (data?.scheme)
      container.addChild(
        buildField("scheme", String(data.scheme), theme, {
          valueTone: "success",
        }),
      );
    if (data?.target)
      container.addChild(buildField("target", String(data.target), theme));
    if (result.durationMs)
      container.addChild(
        buildField(
          "duration",
          `${(result.durationMs / 1000).toFixed(1)}s`,
          theme,
        ),
      );
    if (typeof data?.passedCount === "number")
      container.addChild(
        buildField("passed", data.passedCount, theme, { valueTone: "success" }),
      );
    if (typeof data?.failedCount === "number" && data.failedCount > 0)
      container.addChild(
        buildField("failed", data.failedCount, theme, { valueTone: "error" }),
      );
    if (data?.logPath)
      container.addChild(buildField("log", String(data.logPath), theme));
  }
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
