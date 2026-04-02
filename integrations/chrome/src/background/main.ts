import type {
  BrowserRequest,
  BrowserResponse,
  BrowserRpcMethod,
} from "@/common/browser-rpc";
import {
  type BridgeStatusMessage,
  type ConnectionStatusMessage,
  SIDEPANEL_PORT_NAME,
} from "@/common/constants";
import type { RpcCommand, RpcEvent } from "@/common/pi-rpc-types";
import type { PageCommand } from "@/content/page-types";
import { NativePortManager } from "@/native/port-manager";
import {
  executeBrowserMethod,
  isBrowserRpcMethod,
  toolNavigatingTabs,
} from "./browser-methods";
import { sessionManager } from "./session-manager";

const sidepanelPorts = new Set<chrome.runtime.Port>();
/** windowIds that currently have an open sidepanel. */
const sidepanelWindowIds = new Set<number>();
const sidepanelWindowIdByPort = new WeakMap<chrome.runtime.Port, number>();
const nativePort = new NativePortManager();

let bridgeStatus: BridgeStatusMessage = {
  type: "bridge_status",
  status: "disconnected",
};

let activeToolExecutions = 0;

const SIDEPANEL_WINDOW_SESSION_KEY = "pi.chrome.sidepanel-windows";

async function persistSidepanelWindows(): Promise<void> {
  try {
    await chrome.storage.session.set({
      [SIDEPANEL_WINDOW_SESSION_KEY]: [...sidepanelWindowIds],
    });
  } catch {
    // Ignore storage errors.
  }
}
async function loadSidepanelWindows(): Promise<void> {
  try {
    const stored = await chrome.storage.session.get(
      SIDEPANEL_WINDOW_SESSION_KEY,
    );
    const raw = stored[SIDEPANEL_WINDOW_SESSION_KEY];
    const ids = Array.isArray(raw)
      ? raw.filter((id): id is number => typeof id === "number")
      : [];
    sidepanelWindowIds.clear();
    for (const id of ids) sidepanelWindowIds.add(id);
  } catch {
    sidepanelWindowIds.clear();
  }
}

function shouldEmitForWindow(windowId: number): boolean {
  if (sidepanelWindowIds.size === 0) return true;
  return sidepanelWindowIds.has(windowId);
}

const broadcast = (message: unknown): void => {
  for (const port of sidepanelPorts) {
    try {
      port.postMessage(message);
    } catch {
      sidepanelPorts.delete(port);
    }
  }
};

const sendConnectionStatus = (port: chrome.runtime.Port): void => {
  const status: ConnectionStatusMessage = {
    type: "connection_status",
    connected: bridgeStatus.status === "connected",
  };
  port.postMessage(status);
};

async function setActivePageIndicator(active: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tabId = tabs[0]?.id;
  if (typeof tabId !== "number") return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_SET_INDICATOR",
      params: { active },
    } satisfies PageCommand);
  } catch {
    // Ignore pages without content script receiver.
  }
}

function isSystemUrl(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("javascript:") ||
    url === ""
  );
}

const isBrowserRequest = (message: unknown): message is BrowserRequest => {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<BrowserRequest>;
  return (
    candidate.type === "browser_request" &&
    typeof candidate.id === "string" &&
    typeof candidate.method === "string" &&
    !!candidate.params &&
    typeof candidate.params === "object"
  );
};

async function handleBrowserRequest(message: BrowserRequest): Promise<void> {
  let response: BrowserResponse;

  if (!isBrowserRpcMethod(message.method)) {
    response = {
      type: "browser_response",
      id: message.id,
      ok: false,
      error: `Unsupported browser method: ${message.method}`,
    };
    nativePort.send(response);
    return;
  }

  try {
    const result = await executeBrowserMethod(
      message.method as BrowserRpcMethod,
      message.params,
    );
    response = {
      type: "browser_response",
      id: message.id,
      ok: true,
      result,
    };
  } catch (error) {
    response = {
      type: "browser_response",
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  nativePort.send(response);
}

// ---------------------------------------------------------------------------
// Navigation context events
// ---------------------------------------------------------------------------

function emitNavigationContext(
  url: string,
  title: string,
  favIconUrl: string | undefined,
  tabId: number,
  windowId: number,
  reason: "url_changed" | "tab_activated",
): void {
  if (activeToolExecutions === 0) return;
  if (isSystemUrl(url)) return;
  if (toolNavigatingTabs.has(tabId)) return;
  if (!shouldEmitForWindow(windowId)) return;

  const event: RpcEvent = {
    type: "browser_navigation_context",
    url,
    title,
    favIconUrl,
    tabId,
    windowId,
    reason,
    at: Date.now(),
  };

  broadcast(event);
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (activeToolExecutions === 0) return;
  if (!shouldEmitForWindow(activeInfo.windowId)) return;

  chrome.tabs
    .get(activeInfo.tabId)
    .then((tab) => {
      if (!tab.url || isSystemUrl(tab.url)) return;
      emitNavigationContext(
        tab.url,
        tab.title ?? "",
        tab.favIconUrl,
        activeInfo.tabId,
        activeInfo.windowId,
        "tab_activated",
      );
    })
    .catch(() => {
      // Ignore.
    });
});

chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
  if (details.frameId !== 0) return;
  if (activeToolExecutions === 0) return;
  if (isSystemUrl(details.url)) return;
  if (toolNavigatingTabs.has(details.tabId)) return;

  chrome.tabs
    .get(details.tabId)
    .then((tab) => {
      emitNavigationContext(
        tab.url ?? details.url,
        tab.title ?? "",
        tab.favIconUrl,
        details.tabId,
        tab.windowId,
        "url_changed",
      );
    })
    .catch(() => {
      // Ignore.
    });
});

// ---------------------------------------------------------------------------
// Native port message handling
// ---------------------------------------------------------------------------

nativePort.onStatusChange = (status) => {
  bridgeStatus = status;
  broadcast(status);
  const connectionStatus: ConnectionStatusMessage = {
    type: "connection_status",
    connected: status.status === "connected",
  };
  broadcast(connectionStatus);
};

nativePort.onMessage = (message) => {
  if (isBrowserRequest(message)) {
    void handleBrowserRequest(message);
    return;
  }

  const event = message as RpcEvent;

  if (event.type === "tool_execution_start") {
    activeToolExecutions += 1;
    if (activeToolExecutions === 1) {
      void setActivePageIndicator(true);
    }
  }

  if (event.type === "tool_execution_end") {
    activeToolExecutions = Math.max(0, activeToolExecutions - 1);
    if (activeToolExecutions === 0) {
      void setActivePageIndicator(false);
    }
  }

  if (event.type === "agent_end") {
    activeToolExecutions = 0;
    void setActivePageIndicator(false);
  }

  // Persist session summary when get_state response arrives.
  if (
    event.type === "response" &&
    event.command === "get_state" &&
    event.success &&
    event.data &&
    typeof event.data === "object"
  ) {
    void sessionManager
      .rememberFromState(event.data as Record<string, unknown>)
      .catch(() => {
        // Ignore persistence errors.
      });
  }

  broadcast(event);
};

nativePort.connect();
void loadSidepanelWindows();

// ---------------------------------------------------------------------------
// Sidepanel port management
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDEPANEL_PORT_NAME) {
    return;
  }

  sidepanelPorts.add(port);
  port.postMessage(bridgeStatus);
  sendConnectionStatus(port);

  // Attempt to track the window this sidepanel belongs to.
  const senderWindowId = port.sender?.tab?.windowId;
  if (typeof senderWindowId === "number") {
    sidepanelWindowIds.add(senderWindowId);
    sidepanelWindowIdByPort.set(port, senderWindowId);
    void persistSidepanelWindows();
  } else {
    chrome.windows
      .getLastFocused({})
      .then((win) => {
        if (typeof win.id === "number") {
          sidepanelWindowIds.add(win.id);
          sidepanelWindowIdByPort.set(port, win.id);
          void persistSidepanelWindows();
        }
      })
      .catch(() => {
        // Ignore.
      });
  }

  port.onMessage.addListener((message: RpcCommand) => {
    if (message.type === "retry_native_connection") {
      nativePort.retryConnection();
      return;
    }

    nativePort.send(message);
  });

  port.onDisconnect.addListener(() => {
    sidepanelPorts.delete(port);

    const disconnectedWindowId = sidepanelWindowIdByPort.get(port);
    if (typeof disconnectedWindowId === "number") {
      sidepanelWindowIds.delete(disconnectedWindowId);
      void persistSidepanelWindows();
    }
  });
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidepanel") {
    chrome.windows
      .getLastFocused({})
      .then((win) => {
        if (typeof win.id !== "number") return;
        if (sidepanelWindowIds.has(win.id)) {
          // Close by removing the panel (best-effort; API availability varies).
          const sp = chrome.sidePanel as typeof chrome.sidePanel & {
            close?: (opts: { windowId: number }) => Promise<void>;
          };
          if (typeof sp.close === "function") {
            void sp.close({ windowId: win.id }).catch(() => {
              // Ignore.
            });
          }
        } else {
          void chrome.sidePanel.open({ windowId: win.id }).catch(() => {
            // Ignore.
          });
        }
      })
      .catch(() => {
        // Ignore.
      });
  }
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onStartup.addListener(() => {
  nativePort.connect();
  void loadSidepanelWindows();
});

chrome.runtime.onInstalled.addListener(() => {
  nativePort.connect();
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) =>
      console.error("Failed to set side panel behavior", error),
    );
});
