import { keyHint, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { FlowDeckStatus } from "../../flowdeck/types";
import { containerWith } from "./container-utils";

export type StatusTone = "success" | "warning" | "error" | "muted" | "accent";

/**
 * Build a label: value field, matching the pi-processes buildField pattern.
 */
export function buildField(
  label: string,
  value: string | number | null | undefined,
  theme: Theme,
  options?: { valueTone?: StatusTone },
): Text {
  const displayValue = value != null ? String(value) : "-";
  const styledValue = options?.valueTone
    ? theme.fg(options.valueTone, displayValue)
    : displayValue;

  return new Text(`${theme.fg("muted", `${label}:`)} ${styledValue}`, 0, 0);
}

/**
 * Build a command display field (truncated in collapsed view).
 */
export function buildCommandField(
  command: string,
  theme: Theme,
  options?: { truncate?: boolean; maxWidth?: number },
): Text {
  const max = options?.maxWidth ?? 80;
  const value =
    options?.truncate && command.length > max
      ? command.slice(0, max) + theme.fg("accent", "...")
      : command;

  return buildField("command", theme.fg("accent", `\`${value}\``), theme);
}

/**
 * Map FlowDeckStatus to Pi theme tone.
 */
export function statusTone(status: FlowDeckStatus): StatusTone {
  switch (status) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
    case "running":
      return "muted";
  }
}

/**
 * Build a one-line status summary for collapsed view.
 * Pattern: "status_symbol summary"
 *
 * Examples:
 *   "Build succeeded - 3 warnings - 18.4s"
 *   "Build failed - LoginView.swift:42"
 *   "Tests passed - 142 passed - 31.2s"
 */
export function buildStatusLine(
  status: FlowDeckStatus,
  summary: string,
  theme: Theme,
): Text {
  const symbol =
    status === "success"
      ? theme.fg("success", "done")
      : status === "warning"
        ? theme.fg("warning", "!")
        : status === "error"
          ? theme.fg("error", "failed")
          : theme.fg("muted", "...");

  return new Text(`${symbol} ${summary}`, 0, 0);
}

/**
 * Build a container with multiple field rows.
 */
export function buildFieldsContainer(
  fields: Array<{
    label: string;
    value: string | number | null;
    tone?: StatusTone;
  }>,
  theme: Theme,
): Container {
  const container = new Container();
  for (const field of fields) {
    container.addChild(
      buildField(field.label, field.value, theme, { valueTone: field.tone }),
    );
  }
  return container;
}

/**
 * Build an artifact reference (file paths, etc.).
 */
export function buildArtifactField(
  label: string,
  path: string | undefined,
  theme: Theme,
): Container {
  const container = new Container();
  if (path) {
    container.addChild(buildField(label, theme.fg("dim", path), theme));
  }
  return container;
}

/**
 * Pluralize a noun.
 */
export function plural(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

/**
 * Format a count with a noun.
 */
export function formatCount(count: number, singular: string): string {
  return `${count} ${plural(singular, count)}`;
}

/**
 * Stable placeholder shown while a tool call is still streaming.
 * Every renderResult must handle `options.isPartial` before touching details.
 */
export function buildPartialBody(
  tool: string,
  action: string | undefined,
  theme: Theme,
): Container {
  const label = action ? `${tool} ${action}` : tool;
  return containerWith(
    new Text(theme.fg("muted", `Running ${label}...`), 0, 0),
  );
}

/**
 * Body used when a tool threw. Pi resets `details` to `{}` on a thrown error,
 * so no structured fields are available at this point.
 */
export function buildErrorBody(tool: string, theme: Theme): Container {
  return containerWith(new Text(theme.fg("error", `${tool} failed`), 0, 0));
}

/** Footer hint pointing at the configured expand keybinding. */
export function buildExpandFooter(theme: Theme): Text {
  return new Text(
    theme.fg("dim", keyHint("app.tools.expand", "to expand")),
    0,
    0,
  );
}

export { FlowDeckActionHeader } from "./action-header";
export { containerWith, containerWithChildren } from "./container-utils";
export { FlowDeckToolLayout } from "./tool-layout";
