import { Type } from "@sinclair/typebox";
import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Box, Container, SelectList, type SelectItem, Text } from "@mariozechner/pi-tui";

const PROOF_BASE_URL = "http://localhost:9847";
const POLL_INTERVAL_MS = 3000;
const PROOF_EVENTS_CUSTOM_TYPE = "proof-bridge-events";

type JsonObject = Record<string, unknown>;

type ProofWindow = {
  windowId: string;
  hasBridge?: string | boolean;
  filename?: string;
  documentId?: string;
};

type ProofWindowsResponse = {
  windows: ProofWindow[];
  count: number;
};

type ProofState = {
  revision: number;
  content?: string;
  markdownContent?: string;
  plainText?: string;
  [key: string]: unknown;
};

type ProofBridgeEvent = {
  event?: string;
  type?: string;
  at?: string;
  data?: JsonObject;
};

type ProofEventsResponse = {
  events?: ProofBridgeEvent[];
};

type ProofEventsMessageDetails = {
  count: number;
  summary: string;
  events: ProofBridgeEvent[];
};

type SessionRuntime = {
  sessionId: string;
  agentId: string;
  by: string;
  windowId?: string;
  selectionRequested: boolean;
};

let runtime: SessionRuntime | undefined;
let pollTimer: NodeJS.Timeout | undefined;
let polling = false;

function buildRuntime(ctx: ExtensionContext): SessionRuntime {
  const sessionId = ctx.sessionManager.getSessionId();
  const prefix = sessionId.split("-")[0] || sessionId.slice(0, 8);
  const agentId = `pi-${prefix}`;
  return {
    sessionId,
    agentId,
    by: `ai:${agentId}`,
    windowId: undefined,
    selectionRequested: false,
  };
}

function ensureRuntime(ctx: ExtensionContext): SessionRuntime {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!runtime || runtime.sessionId !== sessionId) {
    runtime = buildRuntime(ctx);
  }
  return runtime;
}

function getRuntimeOrThrow(): SessionRuntime {
  if (!runtime) {
    throw new Error("Proof runtime not initialized yet");
  }
  return runtime;
}

function ensureWindowSelected(): string {
  const current = getRuntimeOrThrow();
  if (!current.windowId) {
    throw new Error("No Proof window selected. Call proof_select_window first.");
  }
  return current.windowId;
}

async function requestBridge<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: JsonObject;
    includeWindow?: boolean;
  },
): Promise<T> {
  const current = getRuntimeOrThrow();
  const method = options?.method ?? "GET";
  const includeWindow = options?.includeWindow ?? true;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agent-Id": current.agentId,
  };

  if (includeWindow) {
    headers["X-Window-Id"] = ensureWindowSelected();
  }

  const response = await fetch(`${PROOF_BASE_URL}${path}`, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    const message =
      (parsed as JsonObject).error ??
      (parsed as JsonObject).message ??
      `HTTP ${response.status}`;
    throw new Error(`${method} ${path} failed: ${String(message)}`);
  }

  return parsed as T;
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

async function enrichWindow(window: ProofWindow): Promise<ProofWindow> {
  if ((window.filename && window.filename.length > 0) || (window.documentId && window.documentId.length > 0)) {
    return window;
  }

  const current = getRuntimeOrThrow();
  try {
    const response = await fetch(`${PROOF_BASE_URL}/state`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": current.agentId,
        "X-Window-Id": window.windowId,
      },
    });

    if (!response.ok) return window;
    const raw = await response.text();
    const state = raw ? (JSON.parse(raw) as ProofState) : undefined;
    const documentPath = typeof state?.documentPath === "string" ? state.documentPath : undefined;
    return {
      ...window,
      documentId: window.documentId ?? documentPath,
      filename: window.filename ?? (documentPath ? basename(documentPath) : undefined),
    };
  } catch {
    return window;
  }
}

async function listWindows(): Promise<ProofWindow[]> {
  const payload = await requestBridge<ProofWindowsResponse>("/windows", { includeWindow: false });
  const windows = payload.windows ?? [];
  return Promise.all(windows.map((window) => enrichWindow(window)));
}

async function getRevision(): Promise<number> {
  const state = await requestBridge<ProofState>("/state", { includeWindow: true });
  if (typeof state.revision !== "number") {
    throw new Error("Proof /state response missing revision");
  }
  return state.revision;
}

function formatDisplayPath(path: string, cwd: string): string {
  if (path === cwd) return ".";
  const cwdPrefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  if (path.startsWith(cwdPrefix)) {
    return path.slice(cwdPrefix.length);
  }

  const home = process.env.HOME;
  if (home) {
    if (path === home) return "~";
    const homePrefix = home.endsWith("/") ? home : `${home}/`;
    if (path.startsWith(homePrefix)) {
      return `~/${path.slice(homePrefix.length)}`;
    }
  }

  return path;
}

function getWindowDisplayLabel(window: ProofWindow, cwd: string): string {
  if (window.documentId && window.documentId.trim().length > 0) {
    return formatDisplayPath(window.documentId, cwd);
  }
  return `(unsaved) ${window.windowId.slice(0, 8)}`;
}

function getWindowDisplayDescription(window: ProofWindow): string {
  return `id=${window.windowId.slice(0, 8)}`;
}

async function chooseWindow(ctx: ExtensionContext, windows: ProofWindow[]): Promise<string | undefined> {
  if (windows.length === 0) return undefined;
  if (windows.length === 1) return windows[0]?.windowId;

  const items: SelectItem[] = windows.map((window) => ({
    value: window.windowId,
    label: getWindowDisplayLabel(window, ctx.cwd),
    description: getWindowDisplayDescription(window),
  }));

  if (ctx.hasUI) {
    const picked = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((v) => theme.fg("accent", v)));
      container.addChild(new Text(theme.fg("accent", theme.bold("Select Proof window"))));

      const selectList = new SelectList(items, Math.min(items.length, 8), {
        selectedPrefix: (v) => theme.fg("accent", v),
        selectedText: (v) => theme.fg("accent", v),
        description: (v) => theme.fg("muted", v),
        scrollInfo: (v) => theme.fg("dim", v),
        noMatch: (v) => theme.fg("warning", v),
      });

      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);

      container.addChild(selectList);
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
      container.addChild(new DynamicBorder((v) => theme.fg("accent", v)));

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    });

    if (picked) return picked;

    const fallbackOptions = windows.map((window) => `${getWindowDisplayLabel(window, ctx.cwd)} (${window.windowId.slice(0, 8)})`);
    const rpcSelected = await ctx.ui.select("Select Proof window", fallbackOptions);
    if (!rpcSelected) return undefined;

    const selected = windows.find((window) =>
      rpcSelected === `${getWindowDisplayLabel(window, ctx.cwd)} (${window.windowId.slice(0, 8)})`
    );
    return selected?.windowId;
  }

  return undefined;
}

function requestWindowSelection(pi: ExtensionAPI, windows: ProofWindow[], cwd: string): void {
  if (!runtime || runtime.selectionRequested) return;
  runtime.selectionRequested = true;

  const options = windows
    .map((window) => `- ${getWindowDisplayLabel(window, cwd)} (windowId=${window.windowId})`)
    .join("\n");

  pi.sendUserMessage(
    `Proof has multiple windows open. Call proof_select_window with one of these windowIds:\n${options}`,
    { deliverAs: "followUp" },
  );
}

async function resetSessionState(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  runtime = buildRuntime(ctx);

  try {
    const windows = await listWindows();

    if (windows.length === 0) {
      pi.sendMessage(
        {
          customType: PROOF_EVENTS_CUSTOM_TYPE,
          content: "Proof: no open windows found.",
          display: true,
          details: {
            count: 0,
            summary: "No windows",
            events: [],
          } satisfies ProofEventsMessageDetails,
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
      return;
    }

    if (windows.length === 1) {
      runtime.windowId = windows[0]?.windowId;
      const selected = windows[0];
      ctx.ui.notify(`Proof window selected: ${getWindowDisplayLabel(selected, ctx.cwd)}`, "info");
      return;
    }

    requestWindowSelection(pi, windows, ctx.cwd);
  } catch (error) {
    ctx.ui.notify(`Proof bridge unavailable on localhost:9847 (${String(error)})`, "warning");
  }
}

function summarizeEvents(events: ProofBridgeEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = event.event ?? event.type ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => `${name} x${count}`)
    .join(", ");
}

function formatEventLines(events: ProofBridgeEvent[], limit: number): string[] {
  return events.slice(0, limit).map((event) => {
    const name = event.event ?? event.type ?? "unknown";
    const markId = typeof event.data?.markId === "string" ? event.data.markId : "-";
    const by = typeof event.data?.by === "string" ? event.data.by : "-";
    return `- ${name} markId=${markId} by=${by}`;
  });
}

async function pollPendingEvents(pi: ExtensionAPI): Promise<void> {
  if (polling) return;
  if (!runtime?.windowId) return;

  polling = true;

  try {
    const primary = await requestBridge<ProofEventsResponse>("/events/pending", {
      includeWindow: true,
    });

    let events = primary.events ?? [];

    // Bridge quirk fallback: some builds emit events only on unscoped pending reads.
    if (events.length === 0) {
      const fallback = await fetch(`${PROOF_BASE_URL}/events/pending`);
      const fallbackRaw = await fallback.text();
      const parsed = fallbackRaw ? (JSON.parse(fallbackRaw) as ProofEventsResponse) : { events: [] };
      events = parsed.events ?? [];
    }

    if (events.length > 0) {
      const summary = summarizeEvents(events);
      pi.sendMessage(
        {
          customType: PROOF_EVENTS_CUSTOM_TYPE,
          content: `Proof events (${events.length}): ${summary}`,
          display: true,
          details: {
            count: events.length,
            summary,
            events,
          } satisfies ProofEventsMessageDetails,
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    }
  } catch {
    // silent; bridge can be temporarily unavailable.
  } finally {
    polling = false;
  }
}

function startPoller(pi: ExtensionAPI) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void pollPendingEvents(pi);
  }, POLL_INTERVAL_MS);
}

function stopPoller() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = undefined;
}

async function postWithBy(path: string, payload: JsonObject): Promise<JsonObject> {
  const current = getRuntimeOrThrow();
  const revision = await getRevision();
  return requestBridge<JsonObject>(path, {
    method: "POST",
    includeWindow: true,
    body: {
      ...payload,
      by: current.by,
      expectedRevision: revision,
    },
  });
}

function truncateInline(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…`;
}

function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getWindowShort(windowId: string | undefined): string {
  return windowId ? windowId.slice(0, 8) : "-";
}

function formatCallSummary(toolName: string, args: unknown): Array<{ label: string; value: string }> {
  const obj = asObject(args) ?? {};

  switch (toolName) {
    case "proof_select_window": {
      const windowId = asString(obj.windowId);
      return [{ label: "window", value: windowId ? getWindowShort(windowId) : "picker" }];
    }
    case "proof_presence": {
      const status = asString(obj.status) ?? "?";
      const summary = asString(obj.summary);
      const options: Array<{ label: string; value: string }> = [{ label: "status", value: status }];
      if (summary) options.push({ label: "summary", value: truncateInline(summary, 36) });
      return options;
    }
    case "proof_suggest_replace":
    case "proof_suggest_insert": {
      const quote = asString(obj.quote);
      const content = asString(obj.content);
      const options: Array<{ label: string; value: string }> = [];
      if (quote) options.push({ label: "quote", value: truncateInline(quote, 24) });
      if (content) options.push({ label: "content", value: truncateInline(content, 24) });
      return options;
    }
    case "proof_suggest_delete": {
      const quote = asString(obj.quote);
      return quote ? [{ label: "quote", value: truncateInline(quote, 30) }] : [];
    }
    case "proof_comment": {
      const quote = asString(obj.quote);
      const text = asString(obj.text);
      const options: Array<{ label: string; value: string }> = [];
      if (quote) options.push({ label: "quote", value: truncateInline(quote, 20) });
      if (text) options.push({ label: "text", value: truncateInline(text, 24) });
      return options;
    }
    case "proof_reply": {
      const markId = asString(obj.markId);
      const text = asString(obj.text);
      const options: Array<{ label: string; value: string }> = [];
      if (markId) options.push({ label: "mark", value: truncateInline(markId, 12) });
      if (text) options.push({ label: "text", value: truncateInline(text, 24) });
      return options;
    }
    case "proof_rewrite_content": {
      const content = asString(obj.content);
      return content ? [{ label: "content", value: `${content.length} chars` }] : [];
    }
    case "proof_rewrite_changes": {
      const changes = Array.isArray(obj.changes) ? obj.changes.length : 0;
      return [{ label: "changes", value: String(changes) }];
    }
    default:
      return [];
  }
}

function formatResultLines(toolName: string, details: unknown, expanded: boolean): string[] {
  const obj = asObject(details);
  if (!obj) return ["Status: Done"];

  if (toolName === "proof_list_windows") {
    const count = asNumber(obj.count) ?? 0;
    const lines = [`Windows: ${count}`];
    const windows = Array.isArray(obj.windows) ? obj.windows : [];
    const max = expanded ? 6 : 2;
    for (const window of windows.slice(0, max)) {
      const w = asObject(window) ?? {};
      const windowId = asString(w.windowId);
      const filename = asString(w.filename);
      const documentId = asString(w.documentId);
      const name = filename ?? (documentId ? basename(documentId) : "(unsaved)");

      lines.push(`Window: ${truncateInline(name, 48)} [${getWindowShort(windowId)}]`);
      if (documentId) {
        lines.push(`Path: ${truncateInline(documentId, 90)}`);
      }
    }
    if (windows.length > max) lines.push(`More: ${windows.length - max}`);
    return lines;
  }

  if (toolName === "proof_select_window") {
    const selected = asString(obj.selectedWindowLabel) ?? asString(obj.selectedWindowId) ?? "unknown";
    const count = asNumber(obj.count);
    return [
      `Selected: ${truncateInline(selected, 80)}`,
      count !== undefined ? `Windows: ${count}` : "",
    ].filter((line) => line.length > 0);
  }

  if (toolName === "proof_get_state") {
    const revision = asNumber(obj.revision);
    const documentPath = asString(obj.documentPath);
    const plainText = asString(obj.plainText) ?? asString(obj.content);
    const lines = [revision !== undefined ? `Revision: ${revision}` : "Status: Fetched"];

    if (documentPath) {
      lines.push(`Document: ${truncateInline(basename(documentPath), 48)}`);
      lines.push(`Path: ${truncateInline(documentPath, 90)}`);
    } else {
      lines.push("Document: (unsaved)");
    }

    if (plainText) {
      lines.push(`Content: ${plainText.length} chars`);
      if (expanded) {
        lines.push(`Preview: ${truncateInline(plainText, 100)}`);
      }
    }

    return lines;
  }

  const successText =
    typeof obj.success === "boolean"
      ? obj.success
        ? "OK"
        : "Failed"
      : "OK";
  const mark = asObject(obj.mark);
  const markId = asString(mark?.id);
  const markQuote = asString(mark?.quote);
  const markData = asObject(mark?.data);
  const markContent = asString(markData?.content);
  const newRevision = asNumber(obj.newRevision);

  const parts = [
    `Status: ${successText}`,
    markId ? `Mark: ${truncateInline(markId, 16)}` : "",
    newRevision !== undefined ? `Revision: ${newRevision}` : "",
    markQuote ? `Quote: ${truncateInline(markQuote, 70)}` : "",
    markContent ? `Change: ${truncateInline(markContent, 70)}` : "",
  ].filter((line) => line.length > 0);

  return parts.length > 0 ? parts : ["Status: Done"];
}

function styleResultLines(lines: string[], theme: Theme): string {
  return lines
    .map((line) => {
      const idx = line.indexOf(": ");
      if (idx === -1) return theme.fg("toolOutput", line);
      const key = line.slice(0, idx + 1);
      const value = line.slice(idx + 2);
      return `${theme.fg("dim", key)} ${theme.fg("accent", value)}`;
    })
    .join("\n");
}

function buildTool<TParams extends JsonObject>(
  name: string,
  label: string,
  description: string,
  parameters: ToolDefinition["parameters"],
  execute: (params: TParams, ctx: ExtensionContext) => Promise<JsonObject | ProofState | ProofWindowsResponse>,
): ToolDefinition {
  return {
    name,
    label,
    description,
    parameters,
    renderCall: (args, theme) => {
      const options = formatCallSummary(name, args);
      const parts: string[] = [theme.fg("toolTitle", theme.bold(label))];
      for (const option of options) {
        parts.push(`${theme.fg("muted", `${option.label}=`)}${theme.fg("dim", option.value)}`);
      }
      return new Text(parts.join(" "), 0, 0);
    },
    renderResult: (result, options, theme) => {
      const lines = formatResultLines(name, result.details, options.expanded);
      return new Text(styleResultLines(lines, theme), 0, 0);
    },
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      ensureRuntime(ctx);
      const result = await execute(params as TParams, ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: (result ?? {}) as JsonObject,
      };
    },
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerMessageRenderer(PROOF_EVENTS_CUSTOM_TYPE, (message, { expanded }, theme) => {
    const details = message.details as ProofEventsMessageDetails | undefined;
    const count = details?.count ?? 0;
    const summary = details?.summary ?? "";
    const events = details?.events ?? [];

    const lines = [
      theme.bold(`Proof events (${count})`),
      summary ? theme.fg("muted", summary) : theme.fg("muted", "No summary"),
      "",
      ...formatEventLines(events, expanded ? 12 : 4),
    ];

    if (!expanded && events.length > 4) {
      lines.push(theme.fg("dim", `…and ${events.length - 4} more (expand to view)`));
    }

    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(lines.join("\n"), 0, 0));
    return box;
  });

  startPoller(pi);

  pi.on("session_start", async (_event, ctx) => {
    await resetSessionState(pi, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await resetSessionState(pi, ctx);
  });

  pi.on("session_shutdown", async () => {
    stopPoller();
  });

  pi.registerTool(
    buildTool(
      "proof_list_windows",
      "Proof List Windows",
      "List open Proof windows from local bridge.",
      Type.Object({}),
      async (_params, ctx) => {
        ensureRuntime(ctx);
        const windows = await listWindows();
        return { windows, count: windows.length };
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_select_window",
      "Proof Select Window",
      "Select active Proof window for all bridge calls. Required when multiple docs are open.",
      Type.Object({
        windowId: Type.Optional(
          Type.String({ description: "Optional explicit windowId. If omitted, opens selector when needed." }),
        ),
      }),
      async (params, ctx) => {
        ensureRuntime(ctx);
        const windows = await listWindows();
        if (windows.length === 0) {
          throw new Error("No Proof windows available. Open a markdown file in Proof first.");
        }

        if (params.windowId) {
          const found = windows.find((w) => w.windowId === params.windowId);
          if (!found) {
            throw new Error(`Unknown windowId: ${params.windowId}`);
          }
          runtime!.windowId = found.windowId;
          runtime!.selectionRequested = false;
          return {
            selectedWindowId: found.windowId,
            selectedWindowLabel: getWindowDisplayLabel(found, ctx.cwd),
            count: windows.length,
          };
        }

        const picked = await chooseWindow(ctx, windows);
        if (!picked) {
          throw new Error(
            "Window selection required. In non-interactive mode pass windowId explicitly to proof_select_window.",
          );
        }

        runtime!.windowId = picked;
        runtime!.selectionRequested = false;
        const selected = windows.find((window) => window.windowId === picked);
        return {
          selectedWindowId: picked,
          selectedWindowLabel: getWindowDisplayLabel(selected ?? { windowId: picked }, ctx.cwd),
          count: windows.length,
        };
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_get_state",
      "Proof Get State",
      "Get current Proof document state.",
      Type.Object({}),
      async (_params) => {
        return requestBridge<ProofState>("/state", { includeWindow: true });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_presence",
      "Proof Presence",
      "Set agent presence status in Proof sidebar.",
      Type.Object({
        status: Type.Union(
          [
            Type.Literal("idle"),
            Type.Literal("reading"),
            Type.Literal("thinking"),
            Type.Literal("acting"),
            Type.Literal("waiting"),
            Type.Literal("completed"),
          ],
          {
            description: "Presence status shown in Proof.",
          },
        ),
        summary: Type.String({ description: "Short status summary shown in Proof sidebar." }),
      }),
      async (params) => {
        return requestBridge<JsonObject>("/presence", {
          method: "POST",
          includeWindow: true,
          body: {
            status: params.status,
            summary: params.summary,
          },
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_suggest_replace",
      "Proof Suggest Replace",
      "Suggest replacing quote text in Proof.",
      Type.Object({
        quote: Type.String({ description: "Exact text to replace." }),
        content: Type.String({ description: "Replacement content." }),
      }),
      async (params) => {
        return postWithBy("/marks/suggest-replace", {
          quote: params.quote,
          content: params.content,
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_suggest_insert",
      "Proof Suggest Insert",
      "Suggest inserting content after quote text in Proof.",
      Type.Object({
        quote: Type.String({ description: "Anchor text after which to insert." }),
        content: Type.String({ description: "Content to insert." }),
      }),
      async (params) => {
        return postWithBy("/marks/suggest-insert", {
          quote: params.quote,
          content: params.content,
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_suggest_delete",
      "Proof Suggest Delete",
      "Suggest deleting quote text in Proof.",
      Type.Object({
        quote: Type.String({ description: "Exact text to delete." }),
      }),
      async (params) => {
        return postWithBy("/marks/suggest-delete", {
          quote: params.quote,
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_comment",
      "Proof Comment",
      "Leave a comment on quote text in Proof.",
      Type.Object({
        quote: Type.String({ description: "Text range to comment on." }),
        text: Type.String({ description: "Comment content." }),
      }),
      async (params) => {
        return postWithBy("/marks/comment", {
          quote: params.quote,
          text: params.text,
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_reply",
      "Proof Reply",
      "Reply to a Proof comment thread.",
      Type.Object({
        markId: Type.String({ description: "Comment mark id." }),
        text: Type.String({ description: "Reply content." }),
      }),
      async (params) => {
        return postWithBy("/marks/reply", {
          markId: params.markId,
          text: params.text,
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_rewrite_content",
      "Proof Rewrite Content",
      "Rewrite full markdown content and let Proof produce tracked diffs.",
      Type.Object({
        content: Type.String({ description: "Full markdown content to diff against current doc." }),
      }),
      async (params) => {
        return postWithBy("/rewrite", {
          content: params.content,
        });
      },
    ),
  );

  pi.registerTool(
    buildTool(
      "proof_rewrite_changes",
      "Proof Rewrite Changes",
      "Rewrite via find/replace changes array and let Proof produce tracked diffs.",
      Type.Object({
        changes: Type.Array(
          Type.Object({
            find: Type.String({ description: "Text to find." }),
            replace: Type.String({ description: "Replacement text." }),
          }),
          { description: "List of find/replace edits." },
        ),
      }),
      async (params) => {
        return postWithBy("/rewrite", {
          changes: params.changes,
        });
      },
    ),
  );
}
