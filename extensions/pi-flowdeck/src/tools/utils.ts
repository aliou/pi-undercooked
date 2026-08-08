import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { FlowDeckResult } from "../flowdeck/types";

/**
 * Generic tool details type. Each tool action returns structured details
 * plus a text summary for the LLM.
 */
export interface ToolDetails {
  action: string;
  result: FlowDeckResult;
}

export type ToolContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface FlowDeckToolResult {
  content: ToolContentBlock[];
  details: ToolDetails;
  isError: boolean;
}

/** Shorthand for the tool update callback these helpers accept. */
export type ToolUpdate = AgentToolUpdateCallback<ToolDetails> | undefined;

/** True when render-time details carry a FlowDeck result. */
export function hasResult(details: unknown): details is ToolDetails {
  return Boolean(
    details &&
      typeof details === "object" &&
      "result" in (details as Record<string, unknown>),
  );
}

/**
 * Format a FlowDeckResult into a text summary for the LLM.
 *
 * Failures include the exit code and both raw streams. FlowDeck writes build
 * and test diagnostics to stderr, and withholding them previously forced
 * agents to re-run commands through raw bash to see the real error.
 */
export function formatResultText(details: ToolDetails): string {
  const { result, action } = details;

  if (!result.ok) {
    const lines = [
      `${action} failed: ${result.error?.message ?? "Unknown error"}`,
    ];
    lines.push(`command: flowdeck ${result.command.join(" ")}`);
    if (result.exitCode != null) lines.push(`exit code: ${result.exitCode}`);
    if (result.rawStderr) lines.push("", "stderr:", result.rawStderr);
    if (result.rawStdout) lines.push("", "stdout:", result.rawStdout);
    return lines.join("\n");
  }

  if (result.data) return JSON.stringify(result.data, null, 2);

  return `${action} completed.`;
}

/**
 * Truncate large payloads and spill the full text to a temp file.
 * Accessibility trees and simulator listings routinely exceed the context
 * budget, so every text block passes through here before reaching the model.
 */
export function truncateForModel(text: string, label: string): string {
  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!truncation.truncated) return truncation.content;

  const dir = mkdtempSync(join(tmpdir(), "pi-flowdeck-"));
  const file = join(dir, `${label}.txt`);
  try {
    writeFileSync(file, text, "utf8");
  } catch {
    return `${truncation.content}\n\n[${label} output truncated to ${truncation.outputLines} of ${truncation.totalLines} lines.]`;
  }

  return [
    truncation.content,
    "",
    `[${label} output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines ` +
      `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ` +
      `Full output saved to: ${file}]`,
  ].join("\n");
}

/** Build a standard tool payload from a FlowDeckResult without throwing. */
export function buildToolResult(
  action: string,
  result: FlowDeckResult,
): FlowDeckToolResult {
  const details: ToolDetails = { action, result };
  return {
    content: [
      {
        type: "text",
        text: truncateForModel(formatResultText(details), action),
      },
    ],
    details,
    isError: !result.ok,
  };
}

/**
 * Finalize a tool payload.
 *
 * Pi's agent loop hardcodes `isError: false` for any tool that returns
 * normally, and throwing would reset `details` to `{}` and lose the structured
 * fields the renderers need. So the payload is returned intact and the
 * `tool_result` hook in `src/hooks/index.ts` flips `isError` using
 * `details.result.ok`.
 *
 * `onUpdate` is accepted so callers can stream progress; it is unused for
 * terminal results.
 */
export function finishToolResult(
  payload: FlowDeckToolResult,
  _onUpdate?: ToolUpdate,
): FlowDeckToolResult {
  return payload;
}

/** Create a standard tool result from a FlowDeckResult. */
export function makeToolResult(
  action: string,
  result: FlowDeckResult,
  onUpdate?: ToolUpdate,
): FlowDeckToolResult {
  return finishToolResult(buildToolResult(action, result), onUpdate);
}

/** Create a tool result with custom content. */
export function makeCustomToolResult(
  content: ToolContentBlock[],
  details: ToolDetails,
  onUpdate?: ToolUpdate,
): FlowDeckToolResult {
  return finishToolResult(
    { content, details, isError: !details.result.ok },
    onUpdate,
  );
}
