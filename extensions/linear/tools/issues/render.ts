import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { SerializedIssue } from "../../../../src/tools/issues/types";

/** Multi-line expanded representation of an issue (title shown separately). */
export function renderIssueExpanded(
  issue: SerializedIssue,
  theme: Theme,
): Component[] {
  const components: Component[] = [];

  const meta: string[] = [];
  meta.push(theme.fg("muted", "Status: ") + issue.state);
  meta.push(theme.fg("muted", "Priority: ") + issue.priorityLabel);
  if (issue.assignee) {
    meta.push(theme.fg("muted", "Assignee: ") + issue.assignee);
  }
  components.push(new Text(meta.join(theme.fg("dim", " | ")), 0, 0));

  const details: string[] = [];
  if (issue.project) {
    details.push(theme.fg("muted", "Project: ") + issue.project);
  }
  if (issue.milestone) {
    details.push(theme.fg("muted", "Milestone: ") + issue.milestone);
  }
  details.push(theme.fg("muted", "Team: ") + issue.team);
  if (issue.labels.length > 0) {
    details.push(theme.fg("muted", "Labels: ") + issue.labels.join(", "));
  }
  if (issue.dueDate) {
    details.push(theme.fg("muted", "Due: ") + issue.dueDate);
  }
  if (issue.estimate !== undefined) {
    details.push(theme.fg("muted", "Estimate: ") + String(issue.estimate));
  }
  if (issue.branchName) {
    details.push(theme.fg("muted", "Branch: ") + issue.branchName);
  }
  if (details.length > 0) {
    components.push(new Text(details.join("\n"), 0, 0));
  }

  if (issue.description) {
    components.push(new Spacer(1));
    components.push(new Markdown(issue.description, 0, 0, getMarkdownTheme()));
  }

  components.push(new Text(theme.fg("muted", issue.url), 0, 0));

  return components;
}

/** Render sub-issues as one-liners in collapsed format. */
export function renderIssueChildren(
  children: SerializedIssue[],
  theme: Theme,
): Component[] {
  if (children.length === 0) return [];
  const components: Component[] = [
    new Spacer(1),
    new Text(theme.fg("muted", `Sub-issues (${children.length}):`), 0, 0),
    new Spacer(1),
  ];
  for (const child of children) {
    const parts = [
      `${theme.fg("accent", child.identifier)}`,
      child.title,
      theme.fg("dim", "|"),
      child.state,
      theme.fg("dim", "|"),
      child.priorityLabel,
    ];
    if (child.assignee) {
      parts.push(theme.fg("dim", "|"));
      parts.push(theme.fg("muted", `Assignee: ${child.assignee}`));
    }
    components.push(new Text(parts.join(" "), 0, 0));
  }
  return components;
}
