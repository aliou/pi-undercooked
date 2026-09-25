import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { configLoader } from "../../config";
import { readScreenshotAsImageContent } from "../../flowdeck/image-utils";
import { getRegistry } from "../../flowdeck/registry";
import {
  applyEntry,
  ENTRY_CUSTOM_TYPE,
  type FlowDeckSessionEntry,
  getActiveSession,
} from "../../flowdeck/session-state";
import { buildUiMacArgs } from "../args";
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
import { UiMacParams } from "../schema";
import {
  buildToolResult,
  finishToolResult,
  hasResult,
  makeCustomToolResult,
  type ToolContentBlock,
  type ToolDetails,
} from "../utils";

/** Actions that attach a screenshot by default. See ui-simulator for rationale. */
const SCREENSHOT_ACTIONS = new Set(["screen", "session_start"]);

export default async function uiMacExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;
  const client = createClient(pi, config);

  pi.registerTool(
    defineTool({
      name: "flowdeck_ui_mac",
      label: "FlowDeck UI Mac",
      description:
        "macOS UI automation for native apps. Click, type, scroll, use hotkeys, interact with menus and windows. The app parameter defaults to the active macOS session target if omitted. Start a session with flowdeck_session action=start platform=mac before any UI work. Requires user permission for auto-validation.",
      promptSnippet: "Automate macOS app UI: click, type, hotkey, menu, window",
      promptGuidelines: [
        "Use flowdeck_session action=start platform=mac before any UI interaction.",
        "When a session is active, app can be omitted — it defaults to the session target.",
        "macOS UI automation controls the real desktop. Get user confirmation before driving macOS apps.",
        "Use flowdeck_ui_mac with action activate to bring the app to foreground before interactions.",
        "Use flowdeck_ui_mac with action find to check which element will be matched before clicking.",
        "Set screenshot=true on flowdeck_ui_mac only when you need pixels; the accessibility tree is returned for every action.",
        "If a session appears stale, restart it with flowdeck_session action=start platform=mac.",
      ],
      parameters: UiMacParams,
      // Shares the in-memory session registry with flowdeck_session and drives
      // the real desktop, so calls must not interleave.
      executionMode: "sequential",
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        // Default app from active session if not provided
        const effectiveParams = { ...params };
        if (
          !effectiveParams.app &&
          effectiveParams.action !== "session_start" &&
          effectiveParams.action !== "session_stop" &&
          effectiveParams.action !== "check_permissions" &&
          effectiveParams.action !== "request_permissions" &&
          effectiveParams.action !== "list_apps" &&
          effectiveParams.action !== "list_screens"
        ) {
          const activeSession = getActiveSession(getRegistry(), "mac");
          if (activeSession) {
            effectiveParams.app = activeSession.target;
          } else {
            return makeCustomToolResult(
              [
                {
                  type: "text" as const,
                  text: "No active macOS FlowDeck session. Start one with flowdeck_session action=start platform=mac app='MyApp'.",
                },
              ],
              {
                action: effectiveParams.action,
                result: {
                  ok: false,
                  status: "error" as const,
                  command: [],
                  error: {
                    kind: "flowdeck_error",
                    message: "No active macOS FlowDeck session",
                  },
                },
              },
              onUpdate,
            );
          }
        }

        const args = buildUiMacArgs(effectiveParams);
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
          const appName = effectiveParams.app ?? "";
          const entry: FlowDeckSessionEntry = {
            event: "started",
            platform: "mac",
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
            target: appName,
            targetKind: appName.includes(".")
              ? "bundle-id"
              : /^\d+$/.test(appName)
                ? "pid"
                : "app-name",
            startedAt: Date.now(),
          };
          pi.appendEntry(ENTRY_CUSTOM_TYPE, entry);
          applyEntry(getRegistry(), entry);

          const activeEntry: FlowDeckSessionEntry = {
            event: "active-set",
            platform: "mac",
            sessionId: entry.sessionId,
            setAt: Date.now(),
          };
          pi.appendEntry(ENTRY_CUSTOM_TYPE, activeEntry);
          applyEntry(getRegistry(), activeEntry);
        }

        if (effectiveParams.action === "session_stop" && result.ok) {
          const activeSession = getActiveSession(getRegistry(), "mac");
          if (activeSession) {
            const entry: FlowDeckSessionEntry = {
              event: "stopped",
              platform: "mac",
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
        const activeSession = getActiveSession(getRegistry(), "mac");
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
        const suffix = args.app
          ? theme.fg("accent", `\`${args.app}\``)
          : theme.fg("dim", "(active session)");
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader(
            "ui mac",
            args.action.replace(/_/g, " "),
            theme,
            { suffix },
          ),
        );
      },
      renderResult(result, options, theme, context) {
        const layout = new FlowDeckToolLayout().withSectionSpacing(
          options.expanded,
        );
        if (options.isPartial) {
          return layout.setBody(buildPartialBody("ui mac", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("ui mac", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeUiMac(details.action, fdResult);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        {
          const body = new Container();
          body.addChild(buildStatusLine(fdResult.status, summary, theme));
          body.addChild(buildUiMacFields(details.action, fdResult, theme));
          layout.setBody(body);
        }
        return layout;
      },
    }),
  );
}

function summarizeUiMac(action: string, result: { data?: unknown }): string {
  const data = result.data as Record<string, unknown> | undefined;
  switch (action) {
    case "session_start":
      return "macOS session started - screenshot + tree available";
    case "session_stop":
      return "Session stopped";
    case "screen":
      return "Screenshot captured";
    case "click":
      return `Clicked ${data?.element ?? data?.target ?? "element"}`;
    case "double_click":
      return "Double-clicked";
    case "right_click":
      return "Right-clicked";
    case "type":
      return "Typed text";
    case "hotkey":
      return `Pressed ${data?.combo ?? "hotkey"}`;
    case "scroll":
      return `Scrolled ${data?.direction ?? ""}`;
    case "find":
      return `Found ${data?.element ?? data?.label ?? "element"}`;
    case "wait":
      return "Condition met";
    case "assert":
      return (data?.passed ?? data?.success)
        ? "Assertion passed"
        : "Assertion failed";
    case "activate":
      return `Activated ${data?.app ?? "app"}`;
    case "quit":
      return "App quit";
    case "launch":
      return "App launched";
    case "check_permissions":
      return "Permissions checked";
    case "request_permissions":
      return "Permissions requested";
    case "menu_click":
      return `Clicked menu ${data?.path ?? ""}`;
    default:
      return "Completed";
  }
}

function buildUiMacFields(
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
    if (data?.app)
      container.addChild(
        buildField("app", String(data.app), theme, { valueTone: "success" }),
      );
  } else if (action === "check_permissions") {
    if (data?.accessibility)
      container.addChild(
        buildField("accessibility", String(data.accessibility), theme),
      );
    if (data?.screenRecording)
      container.addChild(
        buildField("screenRecording", String(data.screenRecording), theme),
      );
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
