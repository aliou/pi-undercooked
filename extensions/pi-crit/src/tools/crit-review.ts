import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  ToolCallHeader,
  type ToolCallHeaderOptionArg,
  ToolFooter,
} from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "typebox";
import { configLoader } from "../config";
import { startReviewListener } from "../utils/review-listener";
import { getActiveSession, trackSession } from "../utils/sessions";

const parameters = Type.Object({
  mode: Type.Optional(
    Type.Union(
      [Type.Literal("auto"), Type.Literal("git"), Type.Literal("files")],
      {
        description:
          "Review mode. auto: reuse active files session if available, else git mode. git: force git diff mode. files: review explicit files (or active files session).",
      },
    ),
  ),
  files: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Specific files or directories to review. Omit to auto-detect git changes.",
    }),
  ),
  baseBranch: Type.Optional(
    Type.String({
      description:
        "Base branch or commit ref to diff against (e.g. 'main', 'HEAD~5', a commit SHA). " +
        "Overrides auto-detection. Use to review changes since a specific point.",
    }),
  ),
  noOpen: Type.Optional(
    Type.Boolean({
      description: "Do not auto-open the browser.",
      default: false,
    }),
  ),
});

type ReviewParams = Static<typeof parameters>;

interface ReviewDetails {
  sessionId?: string;
  pid?: number;
  port?: number;
  url?: string;
  mode?: "auto" | "git" | "files";
  files?: string[];
  baseBranch?: string;
  noOpen?: boolean;
  stdoutLog?: string;
  stderrLog?: string;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function parsePort(text: string): number | undefined {
  const match = text.match(
    /(?:Started|Connected)\s+crit\s+daemon\s+on\s+port\s+(\d+)/i,
  );
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

async function waitForPortFromLog(
  logPath: string,
  timeoutMs = 2000,
): Promise<number | undefined> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const text = await readFile(logPath, "utf-8");
      const port = parsePort(text);
      if (port) return port;
    } catch {
      // Log file may not exist yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return undefined;
}

async function readPortFromSessionFile(
  sessionId: string,
): Promise<number | undefined> {
  const sessionPath = join(homedir(), ".crit", "sessions", `${sessionId}.json`);
  try {
    const raw = await readFile(sessionPath, "utf-8");
    const parsed = JSON.parse(raw) as { port?: number };
    if (typeof parsed.port === "number" && parsed.port > 0) {
      return parsed.port;
    }
  } catch {
    // Session file may not exist yet.
  }

  return undefined;
}

export function registerReviewTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crit_review",
    label: "Crit Review",
    description:
      "Start a review session (non-blocking). Opens the browser UI and returns immediately " +
      "so you can keep working while review is in progress.",
    parameters,

    async execute(
      _toolCallId: string,
      params: ReviewParams,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<ReviewDetails>> {
      const config = configLoader.getConfig();

      const piSessionId = ctx.sessionManager.getSessionId();
      const activeSession = getActiveSession(piSessionId, ctx.cwd);

      const mode = params.mode ?? "auto";
      if (mode === "git" && params.files?.length) {
        throw new Error("mode=git cannot be combined with files");
      }

      let effectiveFiles: string[] | undefined;
      let reusedActiveSession = false;

      if (mode === "git") {
        effectiveFiles = undefined;
      } else if (mode === "files") {
        effectiveFiles = params.files?.length
          ? params.files
          : activeSession?.files;
        reusedActiveSession = !params.files?.length && !!activeSession;
        if (!effectiveFiles?.length) {
          throw new Error(
            "mode=files requires files (or an active files session)",
          );
        }
      } else {
        // auto
        effectiveFiles = params.files?.length
          ? params.files
          : activeSession?.files;
        reusedActiveSession =
          !params.files?.length &&
          !!activeSession &&
          activeSession.files.length > 0;
      }

      const critArgs: string[] = [];

      if (params.noOpen) {
        critArgs.push("--no-open");
      }

      if (params.baseBranch) {
        critArgs.push("--base-branch", params.baseBranch);
      }

      if (config.outputDir) {
        critArgs.push("--output", config.outputDir);
      }

      if (effectiveFiles?.length) {
        critArgs.push(...effectiveFiles);
      }

      const tracked = trackSession(piSessionId, ctx.cwd, effectiveFiles);
      const sessionId = tracked.critSessionId;

      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const stdoutLog = join(tmpdir(), `pi-crit-review-${token}.stdout.log`);
      const stderrLog = join(tmpdir(), `pi-crit-review-${token}.stderr.log`);

      const critCmd = `crit ${critArgs.map(shellEscape).join(" ")}`;
      const launchCmd = `${critCmd} >${shellEscape(stdoutLog)} 2>${shellEscape(stderrLog)} & echo $!`;

      const launchResult = await pi.exec("bash", ["-lc", launchCmd], {
        cwd: ctx.cwd,
        signal,
      });

      if (launchResult.code !== 0) {
        throw new Error(
          `failed to start background crit review (exit ${launchResult.code}): ${launchResult.stderr || launchResult.stdout}`,
        );
      }

      const pid = Number.parseInt(launchResult.stdout.trim(), 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        throw new Error("failed to parse background crit process id");
      }

      const port =
        (await readPortFromSessionFile(sessionId)) ||
        (await waitForPortFromLog(stderrLog));
      const url = port ? `http://localhost:${port}` : undefined;

      startReviewListener({
        pi,
        piSessionId,
        cwd: ctx.cwd,
        critSessionId: sessionId,
        port,
        url,
      });

      const target = effectiveFiles?.length
        ? `${effectiveFiles.length} file${effectiveFiles.length === 1 ? "" : "s"}`
        : "git changes";

      const reusePrefix = reusedActiveSession
        ? "Reused active crit session. "
        : "";
      const text = url
        ? `${reusePrefix}Crit review started in background for ${target}. Session ${sessionId}. URL: ${url}`
        : `${reusePrefix}Crit review started in background for ${target}. Session ${sessionId}. Browser should open automatically.`;

      return {
        content: [{ type: "text", text }],
        details: {
          sessionId,
          pid,
          port,
          url,
          mode,
          files: effectiveFiles,
          baseBranch: params.baseBranch,
          noOpen: params.noOpen ?? false,
          stdoutLog,
          stderrLog,
        },
      };
    },

    renderCall(params: ReviewParams, theme: Theme) {
      const mainArg = params.files?.length
        ? `${params.files.length} file${params.files.length === 1 ? "" : "s"}`
        : "git changes";
      const optionArgs: ToolCallHeaderOptionArg[] = [];
      if (params.mode && params.mode !== "auto") {
        optionArgs.push({ label: "mode", value: params.mode });
      }
      if (params.baseBranch)
        optionArgs.push({ label: "base", value: params.baseBranch });
      if (params.noOpen) optionArgs.push({ label: "no-open", value: "true" });

      return new ToolCallHeader(
        { toolName: "Crit", action: "review", mainArg, optionArgs },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Starting background review..."),
          0,
          0,
        );
      }

      const details = result.details as ReviewDetails | undefined;
      const container = new Container();

      if (!details?.pid) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) ||
          "Failed to start review";
        container.addChild(new Text(theme.fg("error", errorMsg), 0, 0));
        return container;
      }

      const summary = details.url
        ? `Background review started at ${details.url}`
        : "Background review started";
      container.addChild(new Text(theme.fg("success", summary), 0, 0));

      const footerItems = [{ label: "pid", value: String(details.pid) }];
      if (details.sessionId) {
        footerItems.push({ label: "session", value: details.sessionId });
      }
      if (details.port) {
        footerItems.push({ label: "port", value: String(details.port) });
      }
      if (details.mode && details.mode !== "auto") {
        footerItems.push({ label: "mode", value: details.mode });
      }
      if (details.baseBranch) {
        footerItems.push({ label: "base", value: details.baseBranch });
      }

      container.addChild(new Text("", 0, 0));
      container.addChild(
        new ToolFooter(theme, { items: footerItems, separator: " | " }),
      );

      return container;
    },
  });
}
