import type { FlowDeckError, FlowDeckResult } from "./types";

/**
 * Event types that carry a command's final result.
 *
 * FlowDeck emits NDJSON progress streams and the terminal event is not always
 * the last line, so these are matched first when walking backwards.
 */
const COMPLETION_TYPES = new Set([
  // FlowDeck 1.25 terminal event. Carries success plus the full user message,
  // including Xcode diagnostics and the build log path.
  "result",
  "app_list",
  "app_registered",
  "app_stop_all",
  "app_stopped",
  "activity",
  "assertion_result",
  "build_completed",
  "build_finished",
  "clean_completed",
  "config",
  "configs",
  "context",
  "device_list",
  "device_types",
  "license_status",
  "packages_list",
  "project_created",
  "run_completed",
  "run_finished",
  "runtime_list",
  "schemes",
  "session_started",
  "session_stopped",
  "simulator_list",
  "success",
  "sync_profiles",
  "targets",
  "test_completed",
  "test_finished",
  "test_result",
  "ui_result",
  "uninstall_completed",
]);

/**
 * Streaming/progress events that never carry a final result. When no
 * COMPLETION_TYPES event is present, the last event that is not one of these
 * is used instead of blindly taking the last line.
 */
const PROGRESS_TYPES = new Set([
  "app_log",
  "build_progress",
  "build_started",
  "clean_started",
  "configuration",
  "heartbeat",
  "log",
  "progress",
  "run_started",
  "spinner",
  "status",
  "stderr",
  "stdout",
  "test_progress",
  "test_started",
]);

/**
 * Progress events whose message can stand in as the error when nothing else
 * is available. FlowDeck reports some failures only as an `app_log` line.
 * Pure status events like `status` are excluded: "Compiling..." as an error
 * message is worse than saying no result arrived.
 */
const LOG_TYPES = new Set(["app_log", "log", "stderr", "stdout"]);

/** Event types that carry diagnostics worth reporting alongside a failure. */
const DIAGNOSTIC_TYPES = new Set([
  "build_errors",
  "test_failures",
  "diagnostics",
]);

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI SGR sequences
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** FlowDeck colorizes user messages even under --json. */
function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * FlowDeck 1.25 wraps each NDJSON event as `{ $schema, payload, schemaVersion }`.
 * Older versions emit the event at the top level. Unwrap so both work.
 */
function unwrapEvent(raw: Record<string, unknown>): Record<string, unknown> {
  const payload = raw.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return raw;
}

/** Keep raw output attached to failures bounded so it cannot flood the context. */
const RAW_OUTPUT_LIMIT = 4000;

function tailLimit(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= RAW_OUTPUT_LIMIT) return trimmed;
  return `...\n${trimmed.slice(-RAW_OUTPUT_LIMIT)}`;
}

/**
 * What a single output stream told us.
 *
 * `explicit` means the stream contained a real terminal event (a `result`, a
 * known completion type, an error, or a standalone JSON response). Progress
 * events alone are not a result and must never be reported as success.
 */
interface StreamOutcome {
  kind: "explicit" | "progress-only" | "none";
  result?: FlowDeckResult;
  diagnostics: string[];
  /**
   * Best human-readable message seen on this stream even though it carried no
   * terminal result. FlowDeck reports some failures only as an `app_log` event
   * or as plain text on stderr, and that text is the whole diagnosis.
   */
  fallbackMessage?: string;
}

/** First non-empty line of plain text, used when a stream holds no JSON. */
function firstLine(text: string): string | undefined {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ? stripAnsi(line) : undefined;
}

/**
 * Parse FlowDeck output into a normalized result.
 *
 * FlowDeck commands with --json emit either a single JSON object or NDJSON.
 * Build, test, and several UI commands write their payload to stderr rather
 * than stdout, so both streams are parsed and the more definitive one wins.
 */
export function parseFlowDeckOutput(
  stdout: string,
  stderr: string,
  command: string[],
): FlowDeckResult {
  const rawStdout = stdout.trim();
  const rawStderr = stderr.trim();

  const attachRaw = (result: FlowDeckResult): FlowDeckResult => {
    if (!result.ok) {
      result.rawStdout = rawStdout ? tailLimit(rawStdout) : undefined;
      result.rawStderr = rawStderr ? tailLimit(rawStderr) : undefined;
    }
    return result;
  };

  if (!rawStdout && !rawStderr) {
    return {
      ok: false,
      status: "error",
      command,
      error: {
        kind: "parse_error",
        message: "FlowDeck produced no output on stdout or stderr",
      },
    };
  }

  const outcomes = [rawStdout, rawStderr]
    .filter(Boolean)
    .map((stream) => parseStream(stream, command));
  const diagnostics = outcomes.flatMap((outcome) => outcome.diagnostics);
  const fallbackMessage = outcomes.find(
    (outcome) => outcome.fallbackMessage,
  )?.fallbackMessage;

  // A failure on either stream is the most definitive answer. Checking this
  // first stops a stale success on stdout from masking an error on stderr.
  const failure = outcomes.find(
    (outcome) => outcome.kind === "explicit" && outcome.result?.ok === false,
  )?.result;
  if (failure) return attachRaw(withDiagnostics(failure, diagnostics));

  const success = outcomes.find(
    (outcome) => outcome.kind === "explicit" && outcome.result?.ok,
  )?.result;
  if (success) return success;

  // Only progress events. The command did not report a final result, which
  // happens when it is killed part-way through or when FlowDeck reports the
  // failure as a log line instead of a result event.
  if (outcomes.some((outcome) => outcome.kind === "progress-only")) {
    return attachRaw(
      withDiagnostics(
        {
          ok: false,
          status: "error",
          command,
          error: {
            kind: "parse_error",
            message:
              fallbackMessage ??
              (diagnostics.length
                ? "FlowDeck reported errors and no final result"
                : "FlowDeck did not report a final result"),
          },
        },
        diagnostics,
      ),
    );
  }

  // Neither stream held parseable JSON. Hand the raw text back rather than
  // swallowing it: this is what the model needs to diagnose the failure.
  return attachRaw({
    ok: false,
    status: "error",
    command,
    error: {
      kind: "parse_error",
      message: fallbackMessage ?? "Could not parse FlowDeck output as JSON",
    },
  });
}

/** Parse JSON, returning null instead of throwing. Non-JSON text is expected. */
function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (error) {
    void error;
    return null;
  }
}

/** Parse a single output stream. */
function parseStream(stream: string, command: string[]): StreamOutcome {
  // A standalone JSON object is a complete response on its own, unless it is
  // a lone progress or diagnostic event. That happens when a command is killed
  // right after its first line, and must not be reported as success.
  const single = tryParseJson(stream);
  if (single) {
    const event = unwrapEvent(single);
    const type = typeof event.type === "string" ? event.type : "";
    if (PROGRESS_TYPES.has(type)) {
      return {
        kind: "progress-only",
        diagnostics: [],
        fallbackMessage: LOG_TYPES.has(type)
          ? extractMessage(event)
          : undefined,
      };
    }
    if (DIAGNOSTIC_TYPES.has(type)) {
      const message = extractMessage(event);
      return {
        kind: "progress-only",
        diagnostics: message ? [message] : [],
      };
    }
    return {
      kind: "explicit",
      result: normalizeJsonResult(event, command),
      diagnostics: [],
    };
  }

  const events: Record<string, unknown>[] = [];
  const diagnostics: string[] = [];
  let lastError: FlowDeckError | undefined;
  let lastProgressMessage: string | undefined;

  for (const line of stream.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const raw = tryParseJson(trimmed);
    if (!raw) continue; // Non-JSON log line.
    const event = unwrapEvent(raw);
    events.push(event);

    const type = typeof event.type === "string" ? event.type : "";
    if (LOG_TYPES.has(type)) {
      lastProgressMessage = extractMessage(event) ?? lastProgressMessage;
    }
    if (DIAGNOSTIC_TYPES.has(type)) {
      const message = extractMessage(event);
      if (message) diagnostics.push(message);
    }

    if (type === "error" || event.error) {
      lastError = {
        kind: "flowdeck_error",
        message: extractMessage(event) ?? "Unknown error",
        code: typeof event.code === "string" ? event.code : undefined,
        details: event,
      };
    }
  }

  if (events.length === 0) {
    // Plain text. FlowDeck writes some failures to stderr as a bare sentence.
    return { kind: "none", diagnostics, fallbackMessage: firstLine(stream) };
  }

  const completion = findCompletionEvent(events);
  if (completion) {
    return {
      kind: "explicit",
      result: normalizeJsonResult(completion, command),
      diagnostics,
    };
  }

  if (lastError) {
    return {
      kind: "explicit",
      result: { ok: false, status: "error", command, error: lastError },
      diagnostics,
    };
  }

  // Progress or diagnostic events only. Not a result.
  return {
    kind: "progress-only",
    diagnostics,
    fallbackMessage: lastProgressMessage,
  };
}

/** Prepend collected build/test diagnostics to a failing result's message. */
function withDiagnostics(
  result: FlowDeckResult,
  diagnostics: string[],
): FlowDeckResult {
  if (result.ok || diagnostics.length === 0 || !result.error) return result;
  const summary = diagnostics.join("\n");
  if (result.error.message.includes(summary)) return result;
  result.error.message = `${summary}\n${result.error.message}`;
  return result;
}

function findCompletionEvent(
  events: Record<string, unknown>[],
): Record<string, unknown> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const type =
      typeof events[i].type === "string" ? (events[i].type as string) : "";
    if (COMPLETION_TYPES.has(type)) return events[i];
  }

  // No known terminal event. Take the last event that is neither progress nor
  // a diagnostic, so a trailing spinner, log line, or `build_errors` entry is
  // not mistaken for the command's result.
  for (let i = events.length - 1; i >= 0; i--) {
    const type =
      typeof events[i].type === "string" ? (events[i].type as string) : "";
    if (!PROGRESS_TYPES.has(type) && !DIAGNOSTIC_TYPES.has(type)) {
      return events[i];
    }
  }

  return null;
}

/**
 * Pull the most specific human-readable message out of a FlowDeck payload.
 * Falls back through nested error objects and diagnostic arrays so failures
 * report the actual compiler or runtime error rather than a generic string.
 */
function extractMessage(data: Record<string, unknown>): string | undefined {
  const error = data.error;
  if (typeof error === "string" && error.trim()) return stripAnsi(error.trim());
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    for (const key of ["message", "description", "reason"]) {
      const value = nested[key];
      if (typeof value === "string" && value.trim())
        return stripAnsi(value.trim());
    }
  }

  // `userMessage` is FlowDeck's human-facing text and is more complete than
  // `message` for build and test failures.
  for (const key of ["userMessage", "message", "reason", "description"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim())
      return stripAnsi(value.trim());
  }

  // Build and test payloads carry structured diagnostics. Surface the first
  // few errors, which is what the model actually needs to fix the code.
  const diagnostics = firstArray(data, ["diagnostics", "errors", "failures"]);
  if (diagnostics) {
    const rendered = diagnostics
      .slice(0, 5)
      .map((entry) => renderDiagnostic(entry))
      .filter((line): line is string => Boolean(line));
    if (rendered.length > 0) {
      const extra = diagnostics.length - rendered.length;
      return rendered.join("\n") + (extra > 0 ? `\n(+${extra} more)` : "");
    }
  }

  return undefined;
}

function firstArray(
  data: Record<string, unknown>,
  keys: string[],
): unknown[] | undefined {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return undefined;
}

function renderDiagnostic(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry.trim() || undefined;
  if (!entry || typeof entry !== "object") return undefined;
  const record = entry as Record<string, unknown>;
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof record.failureMessage === "string" && record.failureMessage) ||
    (typeof record.name === "string" && record.name) ||
    undefined;
  if (!message) return undefined;
  const file = typeof record.file === "string" ? record.file : undefined;
  const line = typeof record.line === "number" ? record.line : undefined;
  if (file) return `${file}${line != null ? `:${line}` : ""}: ${message}`;
  return message;
}

function normalizeJsonResult(
  data: Record<string, unknown>,
  command: string[],
): FlowDeckResult {
  const isError =
    Boolean(data.error) ||
    data.type === "error" ||
    data.success === false ||
    data.succeeded === false ||
    data.passed === false;

  if (isError) {
    return {
      ok: false,
      status: "error",
      data,
      command,
      error: {
        kind: "flowdeck_error",
        message: extractMessage(data) ?? "FlowDeck reported a failure",
        code: typeof data.code === "string" ? data.code : undefined,
        details: data,
      },
    };
  }

  const hasWarnings =
    typeof data.warnings === "number" && (data.warnings as number) > 0;

  return {
    ok: true,
    status: hasWarnings ? "warning" : "success",
    data,
    command,
  };
}

/**
 * Build FlowDeck CLI arguments for a given command.
 * Adds --json flag automatically.
 */
export function buildArgs(command: string[], json = true): string[] {
  const args = [...command];
  if (json && !args.includes("--json") && !args.includes("-j")) {
    args.push("--json");
  }
  return args;
}
