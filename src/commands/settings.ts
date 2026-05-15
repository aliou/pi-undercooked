import {
  FuzzySelector,
  registerSettingsCommand,
  SettingsDetailEditor,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component, SettingsListTheme } from "@earendil-works/pi-tui";
import { clearClients } from "../client";
import {
  configLoader,
  type LinearConfig,
  type ResolvedLinearConfig,
  type WorkspaceProfile,
} from "../config";
import { clearTeamCache } from "../teams";
import { createAuthWizardComponent } from "./auth-wizard";

function cloneConfig(base: LinearConfig | null): LinearConfig {
  return structuredClone(base ?? ({} as LinearConfig));
}

function formatWorkspaceLabel(
  workspaceKey: string,
  profile: WorkspaceProfile,
): string {
  return `${profile.orgName ?? workspaceKey} (${workspaceKey})`;
}

function removeWorkspaceDraft(
  tabConfig: LinearConfig | null,
  workspaceKey: string,
): LinearConfig {
  const draft = cloneConfig(tabConfig);
  const workspaces = { ...(draft.workspaces ?? {}) };
  delete workspaces[workspaceKey];
  draft.workspaces = workspaces;

  if (draft.defaultWorkspace === workspaceKey) {
    draft.defaultWorkspace = Object.keys(workspaces)[0];
  }

  return draft;
}

function createWorkspaceSubmenu(
  title: string,
  initialKey: string,
  initialProfile: WorkspaceProfile,
  onSave: (
    workspaceKey: string,
    profile: WorkspaceProfile,
    remove?: string,
  ) => void,
  theme: SettingsListTheme,
  done: (summary?: string) => void,
  onDelete?: (workspaceKey: string) => void,
): Component {
  let workspaceKey = initialKey;
  const profile: WorkspaceProfile = structuredClone(initialProfile);

  return new SettingsDetailEditor({
    title,
    theme,
    onDone: () => done(formatWorkspaceLabel(workspaceKey || "(new)", profile)),
    fields: [
      {
        id: "workspaceKey",
        type: "text",
        label: "Workspace key",
        description: "Linear org urlKey (for example: acme).",
        getValue: () => workspaceKey,
        setValue: (value) => {
          const next = value.trim();
          const oldKey = workspaceKey;
          workspaceKey = next;
          if (workspaceKey) onSave(workspaceKey, profile, oldKey || undefined);
        },
        emptyValueText: "(required)",
      },
      {
        id: "orgName",
        type: "text",
        label: "Org name",
        description: "Display name shown in settings and prompt context.",
        getValue: () => profile.orgName ?? "",
        setValue: (value) => {
          profile.orgName = value.trim() || undefined;
          if (workspaceKey) onSave(workspaceKey, profile);
        },
        emptyValueText: "(not set)",
      },
      {
        id: "apiKey",
        type: "text",
        label: "API key",
        description: "Linear personal API key (lin_api_...).",
        getValue: () => profile.apiKey ?? "",
        setValue: (value) => {
          profile.apiKey = value.trim() || undefined;
          if (workspaceKey) onSave(workspaceKey, profile);
        },
        emptyValueText: "(not set)",
      },
      {
        id: "defaultTeamKey",
        type: "text",
        label: "Default team key",
        description: "Used when tools need a team and one is not provided.",
        getValue: () => profile.defaultTeamKey ?? "",
        setValue: (value) => {
          profile.defaultTeamKey = value.trim() || undefined;
          if (workspaceKey) onSave(workspaceKey, profile);
        },
        emptyValueText: "(not set)",
      },
      ...(onDelete
        ? [
            {
              id: "remove",
              type: "action" as const,
              label: "Remove workspace",
              getValue: () => "destructive",
              confirmMessage: `Remove ${workspaceKey}?`,
              onConfirm: () => {
                onDelete(workspaceKey);
                done("removed");
              },
            },
          ]
        : []),
    ],
  });
}

export function registerLinearSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<LinearConfig, ResolvedLinearConfig>(pi, {
    commandName: "linear:settings",
    commandDescription: "Configure Linear extension settings",
    title: "Linear Settings",
    configStore: configLoader,
    onSave: () => {
      clearClients();
      clearTeamCache();
    },
    buildSections: (
      tabConfig: LinearConfig | null,
      resolved: ResolvedLinearConfig,
      ctx,
    ): SettingsSection[] => {
      const workspaceKeys = Object.keys(resolved.workspaces).sort((a, b) =>
        a.localeCompare(b),
      );

      const startStateMode =
        tabConfig?.startUpdateState ?? resolved.startUpdateState;
      const startBranchMode =
        tabConfig?.startCreateBranch ?? resolved.startCreateBranch;

      const generalItems: SettingsSection["items"] = [
        {
          id: "enabled",
          label: "Enabled",
          description: "Enable or disable the extension",
          currentValue:
            (tabConfig?.enabled ?? resolved.enabled) ? "enabled" : "disabled",
          values: ["enabled", "disabled"],
        },
      ];

      const issueStartItems: SettingsSection["items"] = [
        {
          id: "startUpdateState",
          label: "Update state",
          description:
            "Default behavior for moving an issue to In Progress when using linear_issue_start.",
          currentValue: startStateMode,
          values: ["ask", "true", "false"],
        },
        {
          id: "startCreateBranch",
          label: "Create branch",
          description:
            "Default behavior for creating a local git branch when using linear_issue_start.",
          currentValue: startBranchMode,
          values: ["ask", "true", "false"],
        },
      ];

      if (workspaceKeys.length > 1) {
        const selectedDefault =
          tabConfig?.defaultWorkspace ??
          resolved.activeWorkspace ??
          workspaceKeys[0];

        generalItems.push({
          id: "defaultWorkspace",
          label: "Default workspace",
          description: "Workspace used by default when tools run.",
          currentValue: selectedDefault,
          submenu: (_currentValue: string, done: (summary?: string) => void) =>
            new FuzzySelector({
              label: "Default workspace",
              items: workspaceKeys,
              searchThreshold: 7,
              currentValue: selectedDefault,
              theme: ctx.theme,
              onSelect: (selected) => {
                const draft = cloneConfig(tabConfig);
                draft.defaultWorkspace = selected;
                ctx.setDraft(draft);
                done(selected);
              },
              onDone: () => done(),
            }),
        });
      }

      // Use workspace key only for short labels in the list
      const workspaceListItems = workspaceKeys.map((workspaceKey) => {
        const effective =
          tabConfig?.workspaces?.[workspaceKey] ??
          resolved.workspaces[workspaceKey] ??
          {};

        const tags = [
          resolved.activeWorkspace === workspaceKey ? "active" : undefined,
          (tabConfig?.defaultWorkspace ?? resolved.activeWorkspace) ===
          workspaceKey
            ? "default"
            : undefined,
        ].filter(Boolean);

        return {
          id: `workspace.${workspaceKey}`,
          label: workspaceKey,
          description:
            `${effective.orgName ?? workspaceKey}. ` +
            `Team: ${effective.defaultTeamKey ?? "(not set)"}. ` +
            `Run /linear:auth to validate credentials.`,
          currentValue: tags.length > 0 ? tags.join(" · ") : "configured",
          submenu: (_currentValue: string, done: (summary?: string) => void) =>
            createWorkspaceSubmenu(
              "Workspace",
              workspaceKey,
              effective,
              (nextKey, nextProfile, removeKey) => {
                const draft = cloneConfig(tabConfig);
                const workspaces = { ...(draft.workspaces ?? {}) };
                if (removeKey && removeKey !== nextKey)
                  delete workspaces[removeKey];
                workspaces[nextKey] = nextProfile;
                draft.workspaces = workspaces;
                if (!draft.defaultWorkspace) draft.defaultWorkspace = nextKey;
                if (draft.defaultWorkspace === removeKey) {
                  draft.defaultWorkspace = nextKey;
                }
                ctx.setDraft(draft);
              },
              ctx.theme,
              done,
              (toRemove) => {
                const draft = removeWorkspaceDraft(tabConfig, toRemove);
                ctx.setDraft(draft);
              },
            ),
        };
      });

      workspaceListItems.push({
        id: "workspace.add",
        label: "Add workspace",
        description: "Run auth wizard and save directly.",
        currentValue: "open",
        submenu: (_currentValue: string, done: (summary?: string) => void) =>
          createAuthWizardComponent({
            theme: ctx.theme,
            onDone: (saved) => {
              done(saved ? "added" : undefined);
            },
          }),
      });

      return [
        {
          label: "General",
          items: generalItems,
        },
        {
          label: "Issue Start",
          items: issueStartItems,
        },
        {
          label: "Workspaces",
          items: workspaceListItems,
        },
      ];
    },
  });
}
