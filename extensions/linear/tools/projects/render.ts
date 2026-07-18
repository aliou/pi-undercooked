import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { SerializedProject } from "../../../../src/tools/projects/types";

/**
 * Multi-line expanded representation of a project (name + description shown separately).
 * Returns an array of components to allow Markdown rendering.
 */
export function renderProjectExpanded(
  project: SerializedProject,
  theme: Theme,
): Component[] {
  const components: Component[] = [];

  // Status, priority, progress, issues
  const meta: string[] = [];
  meta.push(theme.fg("muted", "Status: ") + project.state);
  meta.push(theme.fg("muted", "Priority: ") + project.priorityLabel);
  meta.push(
    `${theme.fg("muted", "Progress: ")}${Math.round(project.progress * 100)}%`,
  );
  meta.push(theme.fg("muted", "Issues: ") + String(project.issueCount));
  components.push(new Text(meta.join(theme.fg("dim", " | ")), 0, 0));

  // Lead, teams, dates
  const details: string[] = [];
  if (project.lead) {
    details.push(theme.fg("muted", "Lead: ") + project.lead);
  }
  if (project.teams.length > 0) {
    details.push(theme.fg("muted", "Teams: ") + project.teams.join(", "));
  }
  if (project.startDate || project.targetDate) {
    const dates: string[] = [];
    if (project.startDate) dates.push(`Start: ${project.startDate}`);
    if (project.targetDate) dates.push(`Target: ${project.targetDate}`);
    details.push(theme.fg("muted", dates.join(" | ")));
  }
  if (details.length > 0) {
    components.push(new Text(details.join("\n"), 0, 0));
  }

  // External links
  if (project.links.length > 0) {
    const linkLines = project.links
      .map((l) => `${theme.fg("accent", l.label)} ${theme.fg("muted", l.url)}`)
      .join("\n");
    components.push(
      new Text(`${theme.fg("muted", "Links:")}\n${linkLines}`, 0, 0),
    );
  }

  // Documents
  if (project.documents.length > 0) {
    const docLines = project.documents
      .map((d) => `${theme.fg("accent", d.title)} ${theme.fg("muted", d.url)}`)
      .join("\n");
    components.push(
      new Text(`${theme.fg("muted", "Documents:")}\n${docLines}`, 0, 0),
    );
  }

  // Content / summary (rendered as markdown)
  if (project.content) {
    components.push(new Spacer(1));
    components.push(new Markdown(project.content, 0, 0, getMarkdownTheme()));
  }

  // URL
  components.push(new Text(theme.fg("muted", project.url), 0, 0));

  return components;
}
