/**
 * Playwriter extension for pi.
 *
 * Provides tools to control your Chrome browser via Playwright through the
 * playwriter CLI. Requires the playwriter Chrome extension to be installed.
 * The relay server is started automatically on session_start and stopped on
 * session_shutdown.
 *
 * Tools:
 *   - playwriter_session_new: Create a new browser session
 *   - playwriter_session_list: List active sessions
 *   - playwriter_session_delete: Delete a session
 *   - playwriter_eval: Execute Playwright code in a session
 *   - playwriter_screenshot: Take a screenshot of the current page
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import * as childProcess from "node:child_process";

const RELAY_PORT = 19988;
const RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`;

export default function (pi: ExtensionAPI) {
  const extensionDir = path.dirname(new URL(import.meta.url).pathname);
  const bin = path.join(extensionDir, "node_modules", ".bin", "playwriter");

  let serverProcess: childProcess.ChildProcess | null = null;

  // -- server lifecycle -----------------------------------------------------

  async function isServerRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${RELAY_URL}/version`, {
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function startServer(
    ctx: { ui: { notify: (msg: string, level: string) => void; setStatus: (id: string, msg: string | undefined) => void } },
  ): Promise<void> {
    if (await isServerRunning()) {
      ctx.ui.setStatus("playwriter", "playwriter relay: running");
      return;
    }

    ctx.ui.setStatus("playwriter", "playwriter relay: starting...");

    return new Promise<void>((resolve, reject) => {
      const proc = childProcess.spawn(bin, ["serve", "--host", "127.0.0.1"], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      serverProcess = proc;

      const timeoutId = setTimeout(() => {
        reject(new Error("playwriter serve timed out after 10s"));
      }, 10_000);

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes("CDP relay server started")) {
          clearTimeout(timeoutId);
          ctx.ui.setStatus("playwriter", "playwriter relay: running");
          ctx.ui.notify("Playwriter relay server started", "info");
          resolve();
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          console.error(`[playwriter serve] ${text}`);
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutId);
        serverProcess = null;
        ctx.ui.setStatus("playwriter", undefined);
        reject(new Error(`Failed to start playwriter serve: ${err.message}`));
      });

      proc.on("exit", (code) => {
        clearTimeout(timeoutId);
        serverProcess = null;
        ctx.ui.setStatus("playwriter", undefined);
        if (code !== 0 && code !== null) {
          reject(new Error(`playwriter serve exited with code ${code}`));
        }
      });
    });
  }

  function stopServer() {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
  }

  // -- events ---------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    try {
      await startServer(ctx);
    } catch (err: any) {
      ctx.ui.notify(`Playwriter server failed: ${err.message}`, "error");
    }
  });

  pi.on("session_shutdown", async () => {
    stopServer();
  });

  // -- helpers --------------------------------------------------------------

  async function run(args: string[], timeout = 30_000, signal?: AbortSignal) {
    const result = await pi.exec(bin, args, { signal, timeout });
    if (result.code !== 0) {
      const msg = (result.stderr || result.stdout || "unknown error").trim();
      throw new Error(`playwriter exited ${result.code}: ${msg}`);
    }
    return result.stdout.trim();
  }

  // -- session new ----------------------------------------------------------

  pi.registerTool({
    name: "playwriter_session_new",
    label: "Playwriter: New Session",
    description:
      "Create a new playwriter browser session. Returns the session ID. " +
      "The Chrome extension must be active in the browser.",
    parameters: Type.Object({}),

    async execute(_id, _params, signal) {
      const output = await run(["session", "new"], 15_000, signal);
      return {
        content: [{ type: "text", text: output }],
        details: { sessionId: output },
      };
    },
  });

  // -- session list ---------------------------------------------------------

  pi.registerTool({
    name: "playwriter_session_list",
    label: "Playwriter: List Sessions",
    description: "List all active playwriter sessions.",
    parameters: Type.Object({}),

    async execute(_id, _params, signal) {
      const output = await run(["session", "list"], 10_000, signal);
      return {
        content: [{ type: "text", text: output || "(no active sessions)" }],
        details: {},
      };
    },
  });

  // -- session delete -------------------------------------------------------

  pi.registerTool({
    name: "playwriter_session_delete",
    label: "Playwriter: Delete Session",
    description: "Delete an active playwriter session by ID.",
    parameters: Type.Object({
      sessionId: Type.String({ description: "Session ID to delete" }),
    }),

    async execute(_id, params, signal) {
      const { sessionId } = params as { sessionId: string };
      const output = await run(
        ["session", "delete", sessionId],
        10_000,
        signal,
      );
      return {
        content: [{ type: "text", text: output || `Deleted session ${sessionId}` }],
        details: { sessionId },
      };
    },
  });

  // -- eval -----------------------------------------------------------------

  pi.registerTool({
    name: "playwriter_eval",
    label: "Playwriter: Eval",
    description:
      "Execute JavaScript/Playwright code in a browser session. " +
      "Available variables: page (Playwright Page), context (BrowserContext), " +
      "state (persisted between calls), require. " +
      "Example: await page.goto('https://example.com')",
    parameters: Type.Object({
      session: Type.String({ description: "Session ID" }),
      code: Type.String({
        description: "JavaScript code to execute in the browser session",
      }),
      timeout: Type.Optional(
        Type.Number({
          description: "Execution timeout in ms (default 30000)",
        }),
      ),
    }),

    async execute(_id, params, signal) {
      const { session, code, timeout } = params as {
        session: string;
        code: string;
        timeout?: number;
      };
      const args = ["-s", session, "-e", code];
      if (timeout) {
        args.push("--timeout", String(timeout));
      }
      const execTimeout = (timeout ?? 30_000) + 5_000;
      const output = await run(args, execTimeout, signal);
      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { session, code },
      };
    },
  });

  // -- screenshot (convenience, built on eval) ------------------------------

  pi.registerTool({
    name: "playwriter_screenshot",
    label: "Playwriter: Screenshot",
    description:
      "Take a screenshot of the current page in a browser session. " +
      "Returns the file path to the saved screenshot.",
    parameters: Type.Object({
      session: Type.String({ description: "Session ID" }),
      path: Type.Optional(
        Type.String({
          description:
            "File path to save screenshot (default: /tmp/playwriter-screenshot.png)",
        }),
      ),
      fullPage: Type.Optional(
        Type.Boolean({
          description: "Capture the full scrollable page (default false)",
        }),
      ),
    }),

    async execute(_id, params, signal) {
      const {
        session,
        path: savePath = "/tmp/playwriter-screenshot.png",
        fullPage = false,
      } = params as {
        session: string;
        path?: string;
        fullPage?: boolean;
      };

      const code = `await page.screenshot({ path: '${savePath}', fullPage: ${fullPage} })`;
      const args = ["-s", session, "-e", code];
      await run(args, 30_000, signal);

      return {
        content: [
          { type: "text", text: `Screenshot saved to ${savePath}` },
        ],
        details: { session, savePath, fullPage },
      };
    },
  });
}
