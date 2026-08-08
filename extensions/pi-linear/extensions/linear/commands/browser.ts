import { Wizard, type WizardStep } from "@aliou/pi-utils-settings";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { getLinearClient } from "../../../src/client";
import {
  type BrowserListItem,
  BrowserTabListComponent,
} from "./browser-tab-list-component";

async function loadIssueItems(
  _ctx: ExtensionCommandContext,
): Promise<BrowserListItem[]> {
  const client = getLinearClient();
  if (!client) return [];
  const issues = await client.issues({
    first: 100,
    includeArchived: false,
    filter: {
      state: { type: { nin: ["completed", "canceled", "duplicate"] } },
    },
  });
  return issues.nodes.map((issue) => ({
    id: issue.identifier,
    title: issue.title,
  }));
}

async function loadProjectItems(
  _ctx: ExtensionCommandContext,
): Promise<BrowserListItem[]> {
  const client = getLinearClient();
  if (!client) return [];
  const projects = await client.projects({
    first: 100,
    includeArchived: false,
  });
  return projects.nodes.map((project) => ({
    id: project.id,
    title: project.name,
  }));
}

async function loadMilestoneItems(
  _ctx: ExtensionCommandContext,
): Promise<BrowserListItem[]> {
  const client = getLinearClient();
  if (!client) return [];

  const projects = await client.projects({ first: 30, includeArchived: false });
  const items: BrowserListItem[] = [];

  for (const project of projects.nodes) {
    const milestones = await project.projectMilestones({
      first: 20,
      includeArchived: false,
    });
    for (const milestone of milestones.nodes) {
      items.push({
        id: milestone.id,
        title: milestone.name,
        meta: project.name,
      });
    }
  }

  return items;
}

export function registerLinearBrowser(pi: ExtensionAPI): void {
  pi.registerCommand("linear:browse", {
    description: "Browse Linear with tabbed navigation",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) return;
      const client = getLinearClient();
      if (!client) {
        ctx.ui.notify("Linear credentials not configured.", "error");
        return;
      }

      const opened = await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        const steps: WizardStep[] = [
          {
            label: "Issues",
            build: () =>
              new BrowserTabListComponent(
                tui,
                theme,
                "Issues",
                () => loadIssueItems(ctx),
                (item) => {
                  void (async () => {
                    const issue = await client.issue(item.id);
                    const choice = await ctx.ui.select(
                      `Issue ${issue.identifier}`,
                      ["Details", "Comments", "Back"],
                    );
                    if (!choice || choice === "Back") return;
                    if (choice === "Details") {
                      const state = await issue.state;
                      const assignee = await issue.assignee;
                      ctx.ui.notify(
                        [
                          `${issue.identifier}: ${issue.title}`,
                          `State: ${state?.name ?? "Unknown"}`,
                          `Assignee: ${assignee?.displayName ?? "Unassigned"}`,
                          issue.description ?? "(no description)",
                          issue.url,
                        ].join("\n\n"),
                        "info",
                      );
                      return;
                    }
                    if (choice === "Comments") {
                      const comments = await issue.comments({ first: 50 });
                      const commentItems = comments.nodes.map((comment) => ({
                        id: comment.id,
                        title: (comment.body ?? "").split("\n")[0] || "(empty)",
                      }));
                      const selected = await ctx.ui.custom<string | undefined>(
                        (ctui, ctheme, _ckb, cdone) =>
                          new BrowserTabListComponent(
                            ctui,
                            ctheme,
                            `Comments ${issue.identifier}`,
                            commentItems,
                            (commentItem) => cdone(commentItem.id),
                          ),
                      );
                      if (!selected) return;
                      const comment = comments.nodes.find(
                        (c) => c.id === selected,
                      );
                      if (comment)
                        ctx.ui.notify(comment.body ?? "(empty)", "info");
                    }
                  })();
                },
              ),
          },
          {
            label: "Projects",
            build: () =>
              new BrowserTabListComponent(
                tui,
                theme,
                "Projects",
                () => loadProjectItems(ctx),
                (item) => {
                  void (async () => {
                    const project = await client.project(item.id);
                    const lead = await project.lead;
                    ctx.ui.notify(
                      [
                        project.name,
                        `Lead: ${lead?.displayName ?? "Unknown"}`,
                        project.description ?? "(no description)",
                        project.url,
                      ].join("\n\n"),
                      "info",
                    );
                  })();
                },
              ),
          },
          {
            label: "Milestones",
            build: () =>
              new BrowserTabListComponent(
                tui,
                theme,
                "Milestones",
                () => loadMilestoneItems(ctx),
                (item) => {
                  void (async () => {
                    const milestone = await client.projectMilestone(item.id);
                    ctx.ui.notify(
                      [
                        milestone.name,
                        milestone.description ?? "(no description)",
                      ].join("\n\n"),
                      "info",
                    );
                  })();
                },
              ),
          },
        ];

        return new Wizard({
          title: "Linear Browse",
          steps,
          theme,
          onComplete: () => done(null),
          onCancel: () => done(null),
          hintSuffix: "Enter open · Esc close",
          minContentHeight: 16,
        });
      });

      if (opened === undefined) {
        ctx.ui.notify(
          "linear:browse requires interactive TUI mode.",
          "warning",
        );
      }
    },
  });
}
