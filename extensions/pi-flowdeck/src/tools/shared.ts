import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  createReadTool,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  formatSize,
  truncateTail,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { configLoader } from "../config";

interface FlowdeckEvent {
  type?: string;
  message?: string;
  stage?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FlowdeckToolDetails {
  executable: string;
  cwd: string;
  args: string[];
  exitCode: number | null;
  killed: boolean;
  state: "ok" | "error";
  summary: string;
  highlights: string[];
  outputPreview: string;
  parsedEvents: number;
  rawLines: number;
}

export interface FlowdeckToolSpec {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  subcommand?: string[];
  actions?: Record<string, string[]>;
}

function ensureJsonFlag(args: string[]): string[] {
  if (args.includes("--json") || args.includes("-j")) return args;
  return [...args, "--json"];
}

function parseNdjson(output: string): {
  events: FlowdeckEvent[];
  rawLines: string[];
} {
  const events: FlowdeckEvent[] = [];
  const rawLines: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      events.push(JSON.parse(trimmed));
    } catch {
      rawLines.push(trimmed);
    }
  }

  return { events, rawLines };
}

function resolveExecutable(cwd: string, executable: string): string {
  if (!executable.includes("/")) return executable;
  if (executable.startsWith("~/") && process.env.HOME) {
    return resolve(process.env.HOME, executable.slice(2));
  }
  return resolve(cwd, executable);
}

function makeParamsSchema(spec: FlowdeckToolSpec) {
  const shared = {
    args: Type.Optional(
      Type.Array(Type.String({ description: "Additional args" })),
    ),
    cwd: Type.Optional(Type.String({ description: "Working directory" })),
    timeoutSeconds: Type.Optional(
      Type.Number({ minimum: 1, description: "Timeout in seconds" }),
    ),
  };

  if (spec.actions && Object.keys(spec.actions).length > 0) {
    return Type.Object({
      ...shared,
      action: StringEnum(Object.keys(spec.actions) as [string, ...string[]]),
    });
  }

  return Type.Object(shared);
}

function summarizeResult(
  commandLabel: string,
  args: string[],
  exitCode: number | null,
  killed: boolean,
  events: FlowdeckEvent[],
  rawLines: string[],
): { summary: string; highlights: string[]; state: "ok" | "error" } {
  const lastEvent = events.at(-1);
  const lastMessage =
    (typeof lastEvent?.message === "string" && lastEvent.message) ||
    rawLines.at(-1) ||
    undefined;

  const ok = (exitCode ?? 1) === 0 && !killed;
  const state: "ok" | "error" = ok ? "ok" : "error";
  const summary = ok
    ? lastMessage || "FlowDeck command completed"
    : lastMessage || "FlowDeck command failed";

  const highlights: string[] = [];
  highlights.push(`command: ${commandLabel} ${args.join(" ")}`);
  highlights.push(
    `status: ${ok ? "ok" : "error"}${killed ? " (timeout/aborted)" : ""}`,
  );

  const topEvents = events.slice(0, 8);
  for (const event of topEvents) {
    const type = typeof event.type === "string" ? event.type : "event";
    const stage = typeof event.stage === "string" ? `/${event.stage}` : "";
    const message =
      typeof event.message === "string" ? ` ${event.message}` : "";
    highlights.push(`${type}${stage}${message}`.trim());
    if (highlights.length >= 6) break;
  }

  if (highlights.length < 4 && rawLines.length > 0) {
    highlights.push(...rawLines.slice(0, 3));
  }

  return { summary, highlights, state };
}

function collectImagePaths(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".gif")
    ) {
      out.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectImagePaths(item, out);
    return;
  }

  if (value && typeof value === "object") {
    for (const entryValue of Object.values(value as Record<string, unknown>)) {
      collectImagePaths(entryValue, out);
    }
  }
}

async function inlineImageBlocks(
  toolCallId: string,
  cwd: string,
  signal: AbortSignal | undefined,
  events: FlowdeckEvent[],
  targetContent: Array<{ type: string; [key: string]: unknown }>,
) {
  const paths = new Set<string>();
  collectImagePaths(events, paths);
  if (paths.size === 0) return;

  const readTool = createReadTool(cwd);

  for (const filePath of paths) {
    try {
      const readResult = await readTool.execute(
        toolCallId,
        { path: filePath },
        signal,
      );
      const images = readResult.content.filter((item) => item.type === "image");
      if (images.length > 0) {
        targetContent.push(
          ...(images as unknown as Array<{
            type: string;
            [key: string]: unknown;
          }>),
        );
        return;
      }
    } catch {
      // Ignore; path may be relative to another cwd or not readable.
    }
  }
}

function splitCallArgs(args: string[]): {
  mainArg?: string;
  optionArgs: string[];
  longArgs: string[];
} {
  const mainArg = args.find((arg) => !arg.startsWith("-"));

  const optionArgs: string[] = [];
  const longArgs: string[] = [];

  for (const arg of args) {
    if (arg === mainArg) continue;

    const looksLong = arg.length > 48 || arg.includes("\n");
    if (looksLong) {
      longArgs.push(arg);
      continue;
    }

    optionArgs.push(arg);
  }

  return { mainArg, optionArgs, longArgs };
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return "";

  const lines: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type?: unknown }).type === "text" &&
      "text" in block &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      lines.push((block as { text: string }).text);
    }
  }

  return lines.join("\n").trim();
}

export function registerFlowdeckTool(pi: ExtensionAPI, spec: FlowdeckToolSpec) {
  pi.registerTool({
    name: spec.name,
    label: spec.label,
    description: spec.description,
    promptSnippet:
      spec.promptSnippet ??
      `Use ${spec.name} for FlowDeck-based Apple project automation tasks.`,
    promptGuidelines: spec.promptGuidelines ?? [
      "Prefer FlowDeck tools over raw shell commands for Apple project automation.",
      "Select the action or subcommand that matches the requested FlowDeck workflow.",
      "JSON output is enabled by default.",
      "Start with flowdeck_context when project setup or workspace state is unclear.",
    ],
    parameters: makeParamsSchema(spec),
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const parsed = params as {
        args?: string[];
        cwd?: string;
        timeoutSeconds?: number;
        action?: string;
      };

      const config = configLoader.getConfig();
      const executable = resolveExecutable(ctx.cwd, config.flowdeckExecutable);

      if (config.flowdeckExecutable.includes("/") && !existsSync(executable)) {
        return {
          content: [
            {
              type: "text",
              text: `FlowDeck executable not found: ${executable}`,
            },
          ],
          details: { executable },
          isError: true,
        };
      }

      const cwd = parsed.cwd ? resolve(ctx.cwd, parsed.cwd) : ctx.cwd;
      const timeoutSeconds =
        parsed.timeoutSeconds ?? config.defaultTimeoutSeconds;
      const timeoutMs = Math.max(1, Math.floor(timeoutSeconds * 1000));

      const actionArgs =
        spec.actions && parsed.action
          ? (spec.actions[parsed.action] ?? [])
          : [];
      const baseArgs = [
        ...(spec.subcommand ?? []),
        ...actionArgs,
        ...(parsed.args ?? []),
      ];
      const finalArgs = ensureJsonFlag(baseArgs);

      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      let killed = false;

      try {
        const result = await pi.exec(executable, finalArgs, {
          signal,
          timeout: timeoutMs,
          cwd,
        } as never);
        stdout = result.stdout ?? "";
        stderr = result.stderr ?? "";
        exitCode = result.code ?? null;
        killed = !!result.killed;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to start FlowDeck: ${String(error)}`,
            },
          ],
          details: { executable, cwd, args: finalArgs, error: String(error) },
          isError: true,
        };
      }

      const mergedOutput = [stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join("\n\n");
      const parseTarget = [stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join("\n");
      const { events, rawLines } = parseNdjson(parseTarget);

      const truncation = truncateTail(mergedOutput || "(no output)", {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      const { summary, highlights, state } = summarizeResult(
        executable,
        finalArgs,
        exitCode,
        killed,
        events,
        rawLines,
      );

      let text = `Status: ${state}\n${summary}\n`;
      text += `${highlights.map((line) => `- ${line}`).join("\n")}\n\n`;
      text += truncation.content;
      if (truncation.truncated) {
        text += `\n\n[Output truncated to ${DEFAULT_MAX_LINES} lines / ${formatSize(DEFAULT_MAX_BYTES)}]`;
      }

      const content: Array<{ type: string; [key: string]: unknown }> = [
        { type: "text", text },
      ];

      await inlineImageBlocks(toolCallId, cwd, signal, events, content);

      const details: FlowdeckToolDetails = {
        executable,
        cwd,
        args: finalArgs,
        exitCode,
        killed,
        state,
        summary,
        highlights,
        outputPreview: truncation.content,
        parsedEvents: events.length,
        rawLines: rawLines.length,
      };

      return {
        content: content as never,
        details,
        isError: state === "error",
      };
    },

    renderCall(rawArgs, theme) {
      const args = rawArgs as {
        action?: string;
        args?: string[];
      };

      const callArgs = Array.isArray(args.args) ? args.args : [];
      const { mainArg, optionArgs, longArgs } = splitCallArgs(callArgs);

      const firstLineParts = [`${spec.label}:`];
      if (args.action) firstLineParts.push(args.action);
      if (mainArg) firstLineParts.push(mainArg);
      if (optionArgs.length > 0) {
        firstLineParts.push(optionArgs.slice(0, 4).join(" "));
      }

      const lines = [
        `${theme.fg("toolTitle", theme.bold(firstLineParts.join(" ")))}`,
      ];

      if (optionArgs.length > 4) {
        lines.push(
          theme.fg("muted", `options: ${optionArgs.slice(4).join(" ")}`),
        );
      }

      if (longArgs.length > 0) {
        for (const value of longArgs.slice(0, 3)) {
          lines.push(theme.fg("muted", `arg: ${value}`));
        }
        if (longArgs.length > 3) {
          lines.push(theme.fg("muted", `arg: +${longArgs.length - 3} more`));
        }
      }

      return new Text(lines.join("\n"), 0, 0);
    },

    renderResult(result, options, theme) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", `${spec.label}: running...`), 0, 0);
      }

      const details = (result.details ?? {}) as Partial<FlowdeckToolDetails>;
      const contentText = contentToText(result.content);

      if (!details.summary) {
        const fallback = contentText || "FlowDeck command finished";
        return new Text(fallback, 0, 0);
      }

      const isError = details.state === "error";
      const stateLine = isError
        ? theme.fg("error", `Status: error`)
        : theme.fg("success", `Status: ok`);
      const summaryLine = isError
        ? theme.fg("error", details.summary)
        : theme.fg("success", details.summary);

      if (!options.expanded) {
        return new Text(`${stateLine} — ${summaryLine}`, 0, 0);
      }

      const lines: string[] = [stateLine, summaryLine];

      const highlights = Array.isArray(details.highlights)
        ? details.highlights
        : [];
      for (const line of highlights) {
        lines.push(theme.fg("muted", `- ${line}`));
      }

      if (
        typeof details.outputPreview === "string" &&
        details.outputPreview.trim()
      ) {
        lines.push("");
        lines.push(theme.fg("dim", details.outputPreview));
      }

      lines.push("");
      lines.push(
        theme.fg(
          "muted",
          `exit=${details.exitCode ?? "?"} events=${details.parsedEvents ?? 0} raw=${details.rawLines ?? 0}`,
        ),
      );

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
