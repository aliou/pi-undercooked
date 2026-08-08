import type { Scope } from "@aliou/pi-utils-settings";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { clearClients } from "../../../src/client";
import { clearTeamCache } from "../../../src/teams";
import {
  configLoader,
  type LinearConfig,
  type WorkspaceProfile,
} from "../config";
import { runAuthWizard } from "./auth-wizard";

function cloneScopeConfig(scope: Scope): LinearConfig {
  return structuredClone(
    configLoader.getRawConfig(scope) ?? ({} as LinearConfig),
  );
}

function workspaceLabel(
  workspaceKey: string,
  profile?: WorkspaceProfile,
): string {
  const orgName = profile?.orgName ?? workspaceKey;
  return `${orgName} (${workspaceKey})`;
}

async function removeWorkspace(
  ctx: ExtensionCommandContext,
  workspaceKey: string,
): Promise<void> {
  const config = configLoader.getConfig();
  const profile = config.workspaces[workspaceKey];
  if (!profile) {
    ctx.ui.notify("Workspace not found", "warning");
    return;
  }

  const target = workspaceLabel(workspaceKey, profile);
  const confirmed = await ctx.ui.confirm(
    "Remove workspace",
    `Remove ${target}?`,
  );
  if (!confirmed) return;

  const scopes: Scope[] = [];
  for (const scope of ["global", "local"] as const) {
    const raw = configLoader.getRawConfig(scope);
    if (raw?.workspaces?.[workspaceKey]) scopes.push(scope);
  }

  let scope: Scope;
  if (scopes.length === 1) {
    scope = scopes[0] as Scope;
  } else if (scopes.length > 1) {
    const selected = await ctx.ui.select("Remove from which scope?", scopes);
    if (!selected) return;
    scope = selected as Scope;
  } else {
    ctx.ui.notify("Workspace not found in any scope", "warning");
    return;
  }

  const draft = cloneScopeConfig(scope);
  if (!draft.workspaces?.[workspaceKey]) return;

  const nextWorkspaces = { ...draft.workspaces };
  delete nextWorkspaces[workspaceKey];
  draft.workspaces = nextWorkspaces;

  if (draft.defaultWorkspace === workspaceKey) {
    const remaining = Object.keys(nextWorkspaces);
    draft.defaultWorkspace = remaining[0];
  }

  await configLoader.save(scope, draft);
  clearClients();
  clearTeamCache();

  ctx.ui.notify(`Removed workspace ${workspaceKey} from ${scope}`, "info");
}

export function registerLinearAuth(pi: ExtensionAPI): void {
  pi.registerCommand("linear:auth", {
    description: "Add, edit, or remove Linear workspace credentials",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("linear:auth requires interactive mode", "error");
        return;
      }

      const config = configLoader.getConfig();
      const workspaceKeys = Object.keys(config.workspaces).sort((a, b) =>
        a.localeCompare(b),
      );

      if (workspaceKeys.length === 0) {
        ctx.ui.notify("No workspaces configured yet", "info");
        await runAuthWizard(ctx);
        return;
      }

      const labels = workspaceKeys.map((key) =>
        workspaceLabel(key, config.workspaces[key]),
      );
      const selected = await ctx.ui.select("Linear workspaces", [
        ...labels,
        "Add workspace",
      ]);
      if (!selected) return;

      if (selected === "Add workspace") {
        await runAuthWizard(ctx);
        return;
      }

      const workspaceKey = workspaceKeys.find(
        (key) => workspaceLabel(key, config.workspaces[key]) === selected,
      );
      if (!workspaceKey) return;

      const action = await ctx.ui.select(selected, [
        "Edit workspace",
        "Remove workspace",
      ]);
      if (!action) return;

      if (action === "Edit workspace") {
        const profile = config.workspaces[workspaceKey] ?? {};
        const scopes: Scope[] = [];
        for (const s of ["global", "local"] as const) {
          const raw = configLoader.getRawConfig(s);
          if (raw?.workspaces?.[workspaceKey]) scopes.push(s);
        }

        await runAuthWizard(ctx, {
          scope: scopes[0] ?? "global",
          apiKey: profile.apiKey,
          defaultTeamKey: profile.defaultTeamKey,
          oldWorkspaceKey: workspaceKey,
        });
      }

      if (action === "Remove workspace") {
        await removeWorkspace(ctx, workspaceKey);
      }
    },
  });
}
