import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { configLoader } from "../../config";
import { getRegistry, setRegistry } from "../../flowdeck/registry";
import {
  applyEntry,
  ENTRY_CUSTOM_TYPE,
  type FlowDeckSession,
  type FlowDeckSessionEntry,
  getActiveSession,
  listRunningSessions,
  type Platform,
  reconstructFromEntries,
} from "../../flowdeck/session-state";
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
import {
  hasResult,
  makeCustomToolResult,
  makeToolResult,
  type ToolDetails,
  type ToolUpdate,
} from "../utils";

// --- Schema ---

const PLATFORM_VALUES = ["ios", "mac"] as const;
const SESSION_ACTIONS = [
  "start",
  "stop",
  "status",
  "list",
  "set_active",
] as const;

const SessionParams = Type.Object({
  action: StringEnum(SESSION_ACTIONS, {
    description: "Session management action.",
  }),
  platform: Type.Optional(
    StringEnum(PLATFORM_VALUES, {
      description: 'Platform: "ios" (simulator) or "mac".',
    }),
  ),
  simulator: Type.Optional(
    Type.String({
      description: "Simulator name or UDID (ios platform, start action).",
    }),
  ),
  app: Type.Optional(
    Type.String({
      description: "App name, bundle ID, or PID (mac platform, start action).",
    }),
  ),
  intervalMs: Type.Optional(
    Type.Number({
      description: "Capture interval in ms (start action, default 500).",
    }),
  ),
  sessionId: Type.Optional(
    Type.String({
      description: "Specific session ID (for set_active/stop/status).",
    }),
  ),
  all: Type.Optional(
    Type.Boolean({ description: "Stop all active sessions (stop action)." }),
  ),
});

type SessionParamsType = Static<typeof SessionParams>;

// --- Tool ---

export default async function sessionExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;

  const client = createClient(pi, config);

  // Reconstruct state from Pi session entries on load
  pi.on("session_start", async (_event, ctx) => {
    setRegistry(
      reconstructFromEntries(
        ctx.sessionManager.getBranch() as Array<{
          type: string;
          customType?: string;
          data?: unknown;
        }>,
      ),
    );
  });

  pi.on("session_tree", async (_event, ctx) => {
    setRegistry(
      reconstructFromEntries(
        ctx.sessionManager.getBranch() as Array<{
          type: string;
          customType?: string;
          data?: unknown;
        }>,
      ),
    );
  });

  // Cleanup on shutdown: stop all running sessions
  pi.on("session_shutdown", async () => {
    const running = listRunningSessions(getRegistry());
    for (const session of running) {
      await stopCaptureProcess(client, session, undefined);
      const entry: FlowDeckSessionEntry = {
        event: "stopped",
        platform: session.platform,
        sessionId: session.sessionId,
        stoppedAt: Date.now(),
        reason: "shutdown",
      };
      applyEntry(getRegistry(), entry);
    }
  });

  pi.registerTool(
    defineTool({
      name: "flowdeck_session",
      label: "FlowDeck Session",
      description:
        "Manage FlowDeck UI automation sessions. Start/stop background capture sessions for iOS simulators or macOS apps. Sessions continuously capture screenshots and accessibility trees. Always start a session before any UI automation.",
      promptSnippet: "Start, stop, or check FlowDeck UI sessions (iOS/macOS)",
      promptGuidelines: [
        "Use flowdeck_session with action start and platform ios before any flowdeck_ui_simulator interactions.",
        "Use flowdeck_session with action start and platform mac before any flowdeck_ui_mac interactions.",
        "After starting a session, read latestScreenshot and latestTree files to see the screen.",
        "If a session appears stale, use flowdeck_session with action status to check, then restart with action start.",
        "Use flowdeck_session with action stop when done with UI automation to clean up background processes.",
      ],
      parameters: SessionParams,
      // Owns the shared in-memory session registry that the UI tools read.
      executionMode: "sequential",
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        switch (params.action) {
          case "start":
            return handleStart(pi, client, params, ctx, signal, onUpdate);
          case "stop":
            return handleStop(pi, client, params, signal, onUpdate);
          case "status":
            return handleStatus(params);
          case "list":
            return handleList(params);
          case "set_active":
            return handleSetActive(pi, params, onUpdate);
          default:
            return makeToolResult(
              params.action,
              {
                ok: false,
                status: "error",
                command: [],
                error: {
                  kind: "flowdeck_error",
                  message: `Unknown action: ${params.action}`,
                },
              },
              onUpdate,
            );
        }
      },
      renderCall(args, theme) {
        const suffix = args.platform
          ? theme.fg("accent", args.platform)
          : undefined;
        return new FlowDeckToolLayout().setHeader(
          new FlowDeckActionHeader(
            "session",
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
          return layout.setBody(buildPartialBody("session", undefined, theme));
        }
        const details = result.details as ToolDetails | undefined;
        if (!hasResult(details)) {
          return layout.setBody(buildErrorBody("session", theme));
        }
        const fdResult = details.result;
        const summary =
          context.isError || !fdResult.ok
            ? (fdResult.error?.message ?? "Failed")
            : summarizeSession(details.action, fdResult.data);
        if (!options.expanded) {
          layout.setBody(
            containerWith(buildStatusLine(fdResult.status, summary, theme)),
          );
          layout.setFooter(buildExpandFooter(theme));
          return layout;
        }
        const body = new Container();
        body.addChild(buildStatusLine(fdResult.status, summary, theme));
        body.addChild(buildSessionFields(details.action, fdResult, theme));
        layout.setBody(body);
        return layout;
      },
    }),
  );
}

// --- Action handlers ---

async function handleStart(
  pi: ExtensionAPI,
  client: ReturnType<typeof createClient>,
  params: SessionParamsType,
  ctx: { cwd: string },
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdate,
) {
  const platform: Platform = params.platform ?? "ios";

  if (platform === "ios") {
    const sim = params.simulator ?? "iPhone 16";
    const args = ["ui", "simulator", "session", "start", "-S", sim, "--json"];
    if (params.intervalMs)
      args.push("--interval-ms", String(params.intervalMs));
    const result = await client.runCommand(args, { cwd: ctx.cwd, signal });

    if (result.ok && result.data) {
      const data = result.data as Record<string, unknown>;
      const entry: FlowDeckSessionEntry = {
        event: "started",
        platform: "ios",
        sessionId: String(
          data.sessionId ?? data.session_id ?? data.id ?? "unknown",
        ),
        sessionDir: String(
          data.sessionDir ?? data.session_dir ?? data.sessionDirectory ?? "",
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

      // Set as active by default
      const activeEntry: FlowDeckSessionEntry = {
        event: "active-set",
        platform: "ios",
        sessionId: entry.sessionId,
        setAt: Date.now(),
      };
      pi.appendEntry(ENTRY_CUSTOM_TYPE, activeEntry);
      applyEntry(getRegistry(), activeEntry);

      // Enrich the text result with session info (paths for non-vision models)
      const text = [
        `iOS session started for "${sim}".`,
        `Session ID: ${entry.sessionId}`,
        `Screenshot: ${entry.latestScreenshot}`,
        `Tree: ${entry.latestTree}`,
      ].join("\n");

      return makeCustomToolResult(
        [{ type: "text" as const, text }],
        {
          action: "start",
          result: { ...result, data: { ...data, _active: true } },
        },
        onUpdate,
      );
    }
    return makeToolResult("start", result, onUpdate);
  }

  // macOS
  const appName = params.app ?? "";
  if (!appName) {
    return makeCustomToolResult(
      [
        {
          type: "text" as const,
          text: "Error: app parameter is required for macOS session start.",
        },
      ],
      {
        action: "start",
        result: {
          ok: false,
          status: "error",
          command: [],
          error: {
            kind: "flowdeck_error",
            message: "app is required for mac platform",
          },
        },
      },
      onUpdate,
    );
  }

  const args = ["ui", "mac", "session", "start", "--app", appName, "--json"];
  if (params.intervalMs) args.push("--interval-ms", String(params.intervalMs));
  const result = await client.runCommand(args, { cwd: ctx.cwd, signal });

  if (result.ok && result.data) {
    const data = result.data as Record<string, unknown>;
    const entry: FlowDeckSessionEntry = {
      event: "started",
      platform: "mac",
      sessionId: String(
        data.sessionId ?? data.session_id ?? data.id ?? "unknown",
      ),
      sessionDir: String(
        data.sessionDir ?? data.session_dir ?? data.sessionDirectory ?? "",
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

    const text = [
      `macOS session started for "${appName}".`,
      `Session ID: ${entry.sessionId}`,
      `Screenshot: ${entry.latestScreenshot}`,
      `Tree: ${entry.latestTree}`,
    ].join("\n");

    return makeCustomToolResult(
      [{ type: "text" as const, text }],
      {
        action: "start",
        result: { ...result, data: { ...data, _active: true } },
      },
      onUpdate,
    );
  }
  return makeToolResult("start", result, onUpdate);
}

/** Stop the FlowDeck capture process backing a session. Best effort. */
async function stopCaptureProcess(
  client: ReturnType<typeof createClient>,
  session: FlowDeckSession,
  signal: AbortSignal | undefined,
): Promise<void> {
  const args =
    session.platform === "ios"
      ? ["ui", "simulator", "session", "stop", "-S", session.target]
      : ["ui", "mac", "session", "stop", "--app", session.target];
  try {
    await client.runCommand(args, { signal, timeout: 15_000 });
  } catch (error) {
    // Registry state is still updated so the session is not treated as live.
    void error;
  }
}

async function handleStop(
  pi: ExtensionAPI,
  client: ReturnType<typeof createClient>,
  params: SessionParamsType,
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdate,
) {
  if (params.all) {
    const running = listRunningSessions(getRegistry());
    const stopped: string[] = [];
    for (const session of running) {
      try {
        await stopCaptureProcess(client, session, signal);
        const entry: FlowDeckSessionEntry = {
          event: "stopped",
          platform: session.platform,
          sessionId: session.sessionId,
          stoppedAt: Date.now(),
          reason: "user",
        };
        pi.appendEntry(ENTRY_CUSTOM_TYPE, entry);
        applyEntry(getRegistry(), entry);
        stopped.push(`${session.platform}:${session.sessionId}`);
      } catch (error) {
        // Best effort: keep stopping the remaining sessions.
        void error;
      }
    }
    const text =
      stopped.length > 0
        ? `Stopped ${stopped.length} session(s): ${stopped.join(", ")}.`
        : "No running sessions to stop.";
    return makeCustomToolResult(
      [{ type: "text" as const, text }],
      {
        action: "stop",
        result: {
          ok: true,
          status: "success",
          command: [],
          data: { stopped },
        },
      },
      onUpdate,
    );
  }

  const platform = (params.platform ?? "ios") as Platform;
  const sessionId = params.sessionId;
  let target: FlowDeckSession | undefined;

  if (sessionId) {
    target = getRegistry().sessions.get(`${platform}:${sessionId}`);
  } else {
    target = getActiveSession(getRegistry(), platform);
  }

  if (!target || target.status === "stopped") {
    return makeCustomToolResult(
      [
        {
          type: "text" as const,
          text: `No active ${platform} session to stop.`,
        },
      ],
      {
        action: "stop",
        result: {
          ok: false,
          status: "error",
          command: [],
          error: {
            kind: "flowdeck_error",
            message: `No active ${platform} session`,
          },
        },
      },
      onUpdate,
    );
  }

  await stopCaptureProcess(client, target, signal);

  const entry: FlowDeckSessionEntry = {
    event: "stopped",
    platform: target.platform,
    sessionId: target.sessionId,
    stoppedAt: Date.now(),
    reason: "user",
  };
  pi.appendEntry(ENTRY_CUSTOM_TYPE, entry);
  applyEntry(getRegistry(), entry);

  return makeCustomToolResult(
    [
      {
        type: "text" as const,
        text: `Stopped ${platform} session ${target.sessionId}.`,
      },
    ],
    {
      action: "stop",
      result: {
        ok: true,
        status: "success",
        command: [],
        data: { platform: target.platform, sessionId: target.sessionId },
      },
    },
    onUpdate,
  );
}

function handleStatus(params: SessionParamsType) {
  const platform = params.platform as Platform | undefined;
  const sessionId = params.sessionId;

  let session: FlowDeckSession | undefined;
  if (sessionId && platform) {
    session = getRegistry().sessions.get(`${platform}:${sessionId}`);
  } else if (platform) {
    session = getActiveSession(getRegistry(), platform);
  } else {
    // Return all active sessions summary
    const activeIos = getActiveSession(getRegistry(), "ios");
    const activeMac = getActiveSession(getRegistry(), "mac");
    const lines: string[] = [];
    if (activeIos) {
      lines.push(
        `iOS: session ${activeIos.sessionId} (target: ${activeIos.target}, screenshot: ${activeIos.latestScreenshot})`,
      );
    } else {
      lines.push("iOS: no active session");
    }
    if (activeMac) {
      lines.push(
        `macOS: session ${activeMac.sessionId} (target: ${activeMac.target}, screenshot: ${activeMac.latestScreenshot})`,
      );
    } else {
      lines.push("macOS: no active session");
    }
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: {
        action: "status",
        result: {
          ok: true,
          status: "success",
          command: [],
          data: {
            ios: activeIos
              ? {
                  sessionId: activeIos.sessionId,
                  target: activeIos.target,
                  latestScreenshot: activeIos.latestScreenshot,
                  latestTree: activeIos.latestTree,
                }
              : null,
            mac: activeMac
              ? {
                  sessionId: activeMac.sessionId,
                  target: activeMac.target,
                  latestScreenshot: activeMac.latestScreenshot,
                  latestTree: activeMac.latestTree,
                }
              : null,
          },
        },
      },
      isError: false,
    };
  }

  if (!session) {
    return {
      content: [
        { type: "text" as const, text: `No ${platform ?? ""} session found.` },
      ],
      details: {
        action: "status",
        result: {
          ok: true,
          status: "success",
          command: [],
          data: { active: false },
        },
      },
    };
  }

  const isActive =
    getRegistry().activeByPlatform[session.platform] === session.sessionId;
  const lines = [
    `Session: ${session.sessionId}`,
    `Platform: ${session.platform}`,
    `Target: ${session.target} (${session.targetKind})`,
    `Status: ${session.status}`,
    `Active: ${isActive}`,
    `Screenshot: ${session.latestScreenshot}`,
    `Tree: ${session.latestTree}`,
    `Started: ${new Date(session.startedAt).toISOString()}`,
  ];

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    details: {
      action: "status",
      result: {
        ok: true,
        status: "success",
        command: [],
        data: {
          sessionId: session.sessionId,
          platform: session.platform,
          target: session.target,
          targetKind: session.targetKind,
          status: session.status,
          active: isActive,
          latestScreenshot: session.latestScreenshot,
          latestTree: session.latestTree,
          sessionDir: session.sessionDir,
          startedAt: session.startedAt,
        },
      },
    },
    isError: false,
  };
}

function handleList(params: SessionParamsType) {
  const platform = params.platform as Platform | undefined;
  const sessions = listRunningSessions(getRegistry(), platform);

  if (sessions.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No running sessions." }],
      details: {
        action: "list",
        result: {
          ok: true,
          status: "success",
          command: [],
          data: { sessions: [] },
        },
      },
      isError: false,
    };
  }

  const lines = sessions.map((s) => {
    const active =
      getRegistry().activeByPlatform[s.platform] === s.sessionId
        ? " (active)"
        : "";
    return `${s.platform}: ${s.sessionId} -> ${s.target}${active}`;
  });

  return {
    content: [
      { type: "text" as const, text: `Running sessions:\n${lines.join("\n")}` },
    ],
    details: {
      action: "list",
      result: {
        ok: true,
        status: "success",
        command: [],
        data: {
          sessions: sessions.map((s) => ({
            platform: s.platform,
            sessionId: s.sessionId,
            target: s.target,
            active: getRegistry().activeByPlatform[s.platform] === s.sessionId,
            latestScreenshot: s.latestScreenshot,
            latestTree: s.latestTree,
          })),
        },
      },
    },
    isError: false,
  };
}

function handleSetActive(
  pi: ExtensionAPI,
  params: SessionParamsType,
  onUpdate: ToolUpdate,
) {
  const platform = (params.platform ?? "ios") as Platform;
  const sessionId = params.sessionId;

  if (!sessionId) {
    return makeCustomToolResult(
      [
        {
          type: "text" as const,
          text: "Error: sessionId is required for set_active.",
        },
      ],
      {
        action: "set_active",
        result: {
          ok: false,
          status: "error",
          command: [],
          error: { kind: "flowdeck_error", message: "sessionId required" },
        },
      },
      onUpdate,
    );
  }

  const session = getRegistry().sessions.get(`${platform}:${sessionId}`);
  if (!session || session.status === "stopped") {
    return makeCustomToolResult(
      [
        {
          type: "text" as const,
          text: `Session ${sessionId} not found or stopped.`,
        },
      ],
      {
        action: "set_active",
        result: {
          ok: false,
          status: "error",
          command: [],
          error: {
            kind: "flowdeck_error",
            message: `Session ${sessionId} not found or stopped`,
          },
        },
      },
      onUpdate,
    );
  }

  const entry: FlowDeckSessionEntry = {
    event: "active-set",
    platform,
    sessionId,
    setAt: Date.now(),
  };
  pi.appendEntry(ENTRY_CUSTOM_TYPE, entry);
  applyEntry(getRegistry(), entry);

  return {
    content: [
      {
        type: "text" as const,
        text: `Active ${platform} session set to ${sessionId} (${session.target}).`,
      },
    ],
    details: {
      action: "set_active",
      result: {
        ok: true,
        status: "success",
        command: [],
        data: { platform, sessionId, target: session.target },
      },
    },
    isError: false,
  };
}

// --- Rendering helpers ---

function summarizeSession(action: string, data: unknown): string {
  const d = data as Record<string, unknown> | undefined;
  switch (action) {
    case "start":
      return d?._active ? "Session started and set active" : "Session started";
    case "stop":
      return Array.isArray(d?.stopped)
        ? `Stopped ${(d.stopped as string[]).length} session(s)`
        : "Session stopped";
    case "status":
      return d?.active ? "Active session" : "No active session";
    case "list":
      return `${Array.isArray(d?.sessions) ? d.sessions.length : 0} running session(s)`;
    case "set_active":
      return `Active session set to ${d?.sessionId ?? "unknown"}`;
    default:
      return "Completed";
  }
}

function buildSessionFields(
  action: string,
  result: { data?: unknown; command: string[] },
  theme: Theme,
): Container {
  const container = new Container();
  const data = result.data as Record<string, unknown> | undefined;

  if (action === "start" && data) {
    if (data.latestScreenshot)
      container.addChild(
        buildField("screenshot", String(data.latestScreenshot), theme),
      );
    if (data.latestTree)
      container.addChild(buildField("tree", String(data.latestTree), theme));
    if (data.sessionDir)
      container.addChild(
        buildField("sessionDir", String(data.sessionDir), theme),
      );
    if (data.sessionId)
      container.addChild(
        buildField("sessionId", String(data.sessionId), theme, {
          valueTone: "accent",
        }),
      );
  } else if (action === "status" && data) {
    if (data.platform)
      container.addChild(buildField("platform", String(data.platform), theme));
    if (data.target)
      container.addChild(buildField("target", String(data.target), theme));
    if (data.latestScreenshot)
      container.addChild(
        buildField("screenshot", String(data.latestScreenshot), theme),
      );
    if (data.latestTree)
      container.addChild(buildField("tree", String(data.latestTree), theme));
    if (data.active !== undefined)
      container.addChild(
        buildField("active", String(data.active), theme, {
          valueTone: data.active ? "success" : "muted",
        }),
      );
  } else if (action === "list" && data && Array.isArray(data.sessions)) {
    for (const s of data.sessions as Array<Record<string, unknown>>) {
      container.addChild(
        buildField(
          String(s.platform),
          `${s.sessionId} -> ${s.target}${s.active ? " (active)" : ""}`,
          theme,
          { valueTone: s.active ? "success" : "muted" },
        ),
      );
    }
  }

  container.addChild(
    buildCommandField(result.command.join(" "), theme, { truncate: true }),
  );
  return container;
}
