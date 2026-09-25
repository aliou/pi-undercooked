import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { readScreenshotAsImageContent } from "../../flowdeck/image-utils";
// Shared registry - imported from session tool's module scope
// The session tool is the owner, but we need read access here.
// We import the registry getter from a shared location.
import { getRegistry } from "../../flowdeck/registry";
import {
  applyEntry,
  ENTRY_CUSTOM_TYPE,
  type FlowDeckSessionEntry,
  getActiveSession,
} from "../../flowdeck/session-state";
import { buildUiSimulatorArgs } from "../args";
import {
  buildArtifactField,
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
import { UiSimulatorParams } from "../schema";
import {
  buildToolResult,
  finishToolResult,
  hasResult,
  makeCustomToolResult,
  type ToolContentBlock,
  type ToolDetails,
} from "../utils";

/**
 * Actions that attach a screenshot by default.
 *
 * Gestures return the accessibility tree only. Embedding an image on every tap
 * previously produced 213 images across 238 calls in a single project, which
 * dominated the context budget without adding information the tree lacked.
 */
const SCREENSHOT_ACTIONS = new Set(["screen", "session_start"]);

export default async function uiSimulatorExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_ui_simulator",
      label: "FlowDeck UI Simulator",
      description:
        "iOS Simulator UI automation: tap, type, swipe, scroll, find elements, wait, assert conditions, run whole flows with batch, and drive the app. The accessibility tree is the source of truth; screenshots are attached only for the screen and session_start actions or when screenshot=true. The simulator parameter defaults to the active iOS session target if omitted.",
      promptSnippet:
        "Automate iOS Simulator UI: tap, type, swipe, assert, batch flows",
      promptGuidelines: [
        "Use flowdeck_session action=start platform=ios before any UI interaction.",
        "When a session is active, omit simulator on flowdeck_ui_simulator — it defaults to the session target.",
        "Use flowdeck_ui_simulator with action batch to run a multi-step flow in one call instead of chaining separate tap and screen calls.",
        "Use flowdeck_ui_simulator with action screen and interactiveElements=true when you only need tap targets; it is far cheaper than the full tree.",
        "Pass sinceHash on flowdeck_ui_simulator action screen with the hash from the previous capture to get 'unchanged' instead of a repeated tree.",
        "Set screenshot=true on flowdeck_ui_simulator only when a value is rendered without accessibility data, such as custom graphics or charts.",
        "Use flowdeck_ui_simulator with action find to locate elements before interacting.",
        "Use flowdeck_ui_simulator with action scroll and until to scroll to off-screen elements.",
        "Use flowdeck_ui_simulator with action assert to verify element conditions.",
        "If a session appears stale, restart it with flowdeck_session action=start platform=ios.",
      ],
      parameters: UiSimulatorParams,
      // Shares the in-memory session registry with flowdeck_session and
      // flowdeck_ui_mac, and gestures must not interleave on one simulator.
      executionMode: "sequential",
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        // Default simulator from active session if not provided
        const effectiveParams = { ...params };
        if (!effectiveParams.simulator) {
          const activeSession = getActiveSession(getRegistry(), "ios");
          if (activeSession) {
            effectiveParams.simulator = activeSession.target;
          } else if (
            effectiveParams.action !== "session_start" &&
            effectiveParams.action !== "session_stop" &&
            effectiveParams.action !== "screen"
          ) {
            // Only warn for interactive actions, not session management or screen
            return makeCustomToolResult(
              [
                {
                  type: "text",
                  text: "No active iOS FlowDeck session. Start one with flowdeck_session action=start platform=ios simulator='iPhone 16'.",
                },
              ],
              {
                action: effectiveParams.action,
                result: {
                  ok: false,
                  status: "error",
                  command: [],
                  error: {
                    kind: "flowdeck_error",
                    message: "No active iOS FlowDeck session",
                  },
                },
              },
              onUpdate,
            );
          }
        }

        const args = buildUiSimulatorArgs(effectiveParams);
        const result = await client.runCommand(args, {
          cwd: ctx.cwd,
          signal,
          timeout: 120_000,
        });

        // Track session state for session_start/session_stop actions
        if (
          effectiveParams.action === "session_start" &&
          result.ok &&
          result.data
        ) {
          const data = result.data as Record<string, unknown>;
          const sim = effectiveParams.simulator ?? "";
          const entry: FlowDeckSessionEntry = {
            event: "started",
            platform: "ios",
            sessionId: String(
              data.sessionId ?? data.session_id ?? data.id ?? "unknown",
            ),
            sessionDir: String(
              data.sessionDir ??
                data.session_dir ??
                data.sessionDirectory ??
                "",
            ),
            latestScreenshot: String(
              data.latest_screenshot ?? data.latestScreenshot ?? "",
            ),
            latestTree: String(data.latest_tree ?? data.latestTree ?? ""),
            latest: data.latest ? String(data.latest) : undefined,
            target: sim,
            targetKind: sim.includes("-") ? "udid" : "simulator",
            startedAt: Date.now(),
          };
          pi.appendEntry(ENTRY_CUSTOM_TYPE, entry);
          applyEntry(getRegistry(), entry);

          const activeEntry: FlowDeckSessionEntry = {
            event: "active-set",
            platform: "ios",
            sessionId: entry.sessionId,
            setAt: Date.now(),
          };
          pi.appendEntry(ENTRY_CUSTOM_TYPE, activeEntry);
          applyEntry(getRegistry(), activeEntry);
        }

        if (effectiveParams.action === "session_stop" && result.ok) {
          const activeSession = getActiveSession(getRegistry(), "ios");
          if (activeSession) {
            const entry: FlowDeckSessionEntry = {
              event: "stopped",
              platform: "ios",
              sessionId: activeSession.sessionId,
              stoppedAt: Date.now(),
              reason: "user",
            };
            pi.appendEntry(ENTRY_CUSTOM_TYPE, entry);
            applyEntry(getRegistry(), entry);
          }
        }

        // Always report the artifact paths. Only attach the image itself for
        // explicit captures or when the caller opted in with screenshot=true.
        const base = buildToolResult(effectiveParams.action, result);
        const activeSession = getActiveSession(getRegistry(), "ios");
        if (activeSession?.latestScreenshot && result.ok) {
          const textContent = base.content[0];
          const currentText =
            textContent?.type === "text" ? textContent.text : "";
          const pathLine = `\nScreenshot: ${activeSession.latestScreenshot}\nTree: ${activeSession.latestTree}`;
          const content: ToolContentBlock[] = [
            { type: "text", text: currentText + pathLine },
          ];

          const wantsImage =
            params.screenshot === true ||
            (params.screenshot !== false &&
              SCREENSHOT_ACTIONS.has(effectiveParams.action) &&
              !params.treeOnly);

          if (wantsImage) {
            const screenshot = await readScreenshotAsImageContent(
              activeSession.latestScreenshot,
            );
            if (screenshot) content.push(screenshot);
          }
          return finishToolResult({ ...base, content }, onUpdate);
        }
        return finishToolResult(base, onUpdate);
      },
      renderCall(args, theme) {
        const suffix = args.simulator
          ? theme.fg("accent", `\`${args.simulator}\``)
          : theme.fg("dim", "(active session)");
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader("ui", args.action.replace("_", " "), theme, {
            suffix,
          }),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(buildPartialBody("ui", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("ui", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeUiSim(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildUiSimFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

function summarizeUiSim(action: string, result: { data?: unknown }): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "session_start":
      return "Session started - screenshot + tree available";
    case "session_stop":
      return "Session stopped";
    case "tap":
      return `Tapped ${data?.element ?? data?.target ?? "element"}`;
    case "double_tap":
      return `Double-tapped ${data?.element ?? data?.target ?? "element"}`;
    case "type":
      return "Typed text";
    case "swipe":
      return `Swiped ${data?.direction ?? ""}`;
    case "scroll":
      return data?.until ? `Scrolled to ${data.until}` : "Scrolled";
    case "find":
      return `Found ${data?.element ?? data?.label ?? "element"}`;
    case "wait":
      return "Condition met";
    case "assert":
      return (data?.passed ?? data?.success)
        ? "Assertion passed"
        : "Assertion failed";
    case "screen":
      return data?.status === "unchanged"
        ? "Screen unchanged"
        : "Screen captured";
    case "batch":
      return `Batch flow completed${
        Array.isArray(data?.steps) ? ` - ${data.steps.length} steps` : ""
      }`;
    case "touch_down":
      return "Touch down";
    case "touch_up":
      return "Touch up";
    case "back":
      return "Navigated back";
    case "set_appearance":
      return `Appearance set to ${data?.appearance ?? "unknown"}`;
    default:
      return "Completed";
  }
}

function buildUiSimFields(
  action: string,
  result: { data?: unknown; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;
  if (action === "session_start") {
    const ss = buildArtifactField(
      "screenshot",
      (data?.latest_screenshot ?? data?.latestScreenshot) as string | undefined,
      theme,
    );
    const tr = buildArtifactField(
      "tree",
      (data?.latest_tree ?? data?.latestTree) as string | undefined,
      theme,
    );
    if (ss) container.addChild(ss);
    if (tr) container.addChild(tr);
    if (data?.udid)
      container.addChild(buildField("udid", String(data.udid), theme));
    if (data?.sessionDir)
      container.addChild(
        buildField("sessionDir", String(data.sessionDir), theme),
      );
  } else if (action === "screen") {
    const path = data?.output ?? data?.path;
    if (path) container.addChild(buildField("screenshot", String(path), theme));
  } else {
    const elem = data?.element ?? data?.target;
    if (elem)
      container.addChild(
        buildField("element", String(elem), theme, { valueTone: "success" }),
      );
    const coords = data?.coordinates ?? data?.point;
    if (coords)
      container.addChild(buildField("coordinates", String(coords), theme));
  }
  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
