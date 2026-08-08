import type { Scope } from "@aliou/pi-utils-settings";
import {
  FuzzySelector,
  Wizard,
  type WizardStepContext,
} from "@aliou/pi-utils-settings";
import {
  type ExtensionCommandContext,
  getSettingsListTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, SettingsListTheme } from "@earendil-works/pi-tui";
import { Input, Key, matchesKey } from "@earendil-works/pi-tui";
import { LinearClient } from "@linear/sdk";
import { clearClients } from "../../../src/client";
import { clearTeamCache } from "../../../src/teams";
import {
  configLoader,
  type LinearConfig,
  type WorkspaceProfile,
} from "../config";

interface WorkspaceAuthInfo {
  workspaceKey: string;
  orgName: string;
  viewerName: string;
  viewerEmail: string;
  teams: Array<{ key: string; name: string; id: string }>;
}

interface AuthWizardState {
  scope: Scope;
  apiKey: string;
  authInfo: WorkspaceAuthInfo | null;
  authError: string | null;
  validating: boolean;
  defaultTeamKey: string | null;
}

export interface AuthWizardPrefill {
  scope?: Scope;
  apiKey?: string;
  defaultTeamKey?: string;
  oldWorkspaceKey?: string;
}

interface CreateAuthWizardOptions {
  theme: Theme;
  settingsTheme?: SettingsListTheme;
  prefill?: AuthWizardPrefill;
  requestRender?: () => void;
  notify?: (message: string, type?: "info" | "warning" | "error") => void;
  onDone: (saved: boolean) => void;
}

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

async function fetchWorkspaceAuthInfo(
  apiKey: string,
): Promise<WorkspaceAuthInfo> {
  const client = new LinearClient({ apiKey });
  const viewer = await client.viewer;
  const organization = await viewer.organization;
  const teamsResult = await client.teams({
    first: 250,
    includeArchived: false,
  });
  return {
    workspaceKey: organization.urlKey,
    orgName: organization.name,
    viewerName: viewer.name || viewer.displayName,
    viewerEmail: viewer.email,
    teams: teamsResult.nodes
      .map((team) => ({ key: team.key, name: team.name, id: team.id }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function saveWorkspace(
  scope: Scope,
  workspaceKey: string,
  profile: WorkspaceProfile,
  oldWorkspaceKey?: string,
): Promise<void> {
  const draft = cloneScopeConfig(scope);
  const workspaces = { ...(draft.workspaces ?? {}) };
  if (oldWorkspaceKey && oldWorkspaceKey !== workspaceKey)
    delete workspaces[oldWorkspaceKey];
  workspaces[workspaceKey] = profile;
  draft.workspaces = workspaces;
  if (!draft.defaultWorkspace || draft.defaultWorkspace === oldWorkspaceKey) {
    draft.defaultWorkspace = workspaceKey;
  }
  return configLoader.save(scope, draft);
}

class ApiKeyStep implements Component {
  private input: Input;
  constructor(
    private state: AuthWizardState,
    private theme: SettingsListTheme,
    private wizardCtx: WizardStepContext,
  ) {
    this.input = new Input();
    if (state.apiKey) this.input.setValue(state.apiKey);
    this.input.onSubmit = () => {
      this.commit();
      this.wizardCtx.goNext();
    };
    this.commit();
  }
  private commit() {
    this.state.apiKey = this.input.getValue().trim();
    this.state.authInfo = null;
    this.state.authError = null;
    if (this.state.apiKey) this.wizardCtx.markComplete();
    else this.wizardCtx.markIncomplete();
  }
  render(width: number): string[] {
    return [
      this.theme.label(" API Key", true),
      "",
      this.theme.hint("  lin_api_..."),
      `  ${this.input.render(width - 4).join("")}`,
      "",
      this.theme.hint("  Enter: validate key"),
    ];
  }
  invalidate(): void {}
  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;
    this.input.handleInput(data);
    this.commit();
  }
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
class ValidateStep implements Component {
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastKey = "";
  private fallbackInput: Input | null = null;
  constructor(
    private state: AuthWizardState,
    private theme: SettingsListTheme,
    private wizardCtx: WizardStepContext,
    private requestRender?: () => void,
  ) {}

  private runValidation() {
    if (!this.state.apiKey) return;
    if (this.state.apiKey === this.lastKey && this.state.authInfo) return;
    this.lastKey = this.state.apiKey;
    this.state.validating = true;
    this.state.authInfo = null;
    this.state.authError = null;
    this.wizardCtx.markIncomplete();
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER.length;
      this.requestRender?.();
    }, 80);

    fetchWorkspaceAuthInfo(this.state.apiKey)
      .then((info) => {
        this.state.authInfo = info;
        this.state.authError = null;
        this.state.validating = false;
        this.wizardCtx.markComplete();
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.requestRender?.();
      })
      .catch((error) => {
        this.state.validating = false;
        this.state.authInfo = null;
        this.state.authError =
          error instanceof Error ? error.message : String(error);
        this.wizardCtx.markIncomplete();
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        const hasOther =
          Object.keys(configLoader.getConfig().workspaces).length > 0;
        if (hasOther) {
          this.fallbackInput = new Input();
          this.fallbackInput.onSubmit = () => {
            const name = this.fallbackInput?.getValue().trim();
            if (!name) return;
            this.state.authInfo = {
              workspaceKey: name,
              orgName: name,
              viewerName: "unknown",
              viewerEmail: "",
              teams: [],
            };
            this.state.authError = null;
            this.wizardCtx.markComplete();
          };
        }
        this.requestRender?.();
      });
  }

  render(width: number): string[] {
    if (
      !this.state.validating &&
      !this.state.authInfo &&
      !this.state.authError &&
      this.state.apiKey &&
      this.state.apiKey !== this.lastKey
    ) {
      this.runValidation();
    }
    if (!this.state.apiKey)
      return [
        this.theme.label(" Validate", true),
        "",
        this.theme.hint("  No API key set."),
      ];
    if (this.state.validating)
      return [
        this.theme.label(" Validate", true),
        "",
        this.theme.hint(`  ${SPINNER[this.frame]} Validating API key...`),
      ];
    if (this.state.authInfo) {
      const i = this.state.authInfo;
      return [
        this.theme.label(" Validate", true),
        "",
        `  Authenticated as ${i.viewerName} (${i.viewerEmail})`,
        `  Organization: ${i.orgName} (${i.workspaceKey})`,
        `  Teams: ${i.teams.length}`,
      ];
    }
    if (this.fallbackInput) {
      return [
        this.theme.label(" Validate", true),
        "",
        this.theme.hint(`  Error: ${this.state.authError}`),
        "",
        this.theme.hint("  Enter a workspace name manually:"),
        `  ${this.fallbackInput.render(width - 4).join("")}`,
      ];
    }
    return [
      this.theme.label(" Validate", true),
      "",
      this.theme.hint(`  Error: ${this.state.authError}`),
    ];
  }
  invalidate(): void {}
  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;
    if (this.fallbackInput) this.fallbackInput.handleInput(data);
    if (matchesKey(data, Key.enter) && this.state.authError)
      this.runValidation();
  }
}

function formatTeamLabel(team: { key: string; name: string }) {
  return `${team.key} - ${team.name}`;
}
class DefaultTeamStep implements Component {
  private selector: FuzzySelector | null = null;
  private builtCount = -1;
  constructor(
    private state: AuthWizardState,
    private theme: SettingsListTheme,
    private wizardCtx: WizardStepContext,
    private requestRender?: () => void,
  ) {
    this.rebuild();
  }
  private rebuild() {
    const teams = this.state.authInfo?.teams ?? [];
    if (teams.length === this.builtCount) return;
    this.builtCount = teams.length;
    if (teams.length === 0) {
      this.selector = null;
      this.wizardCtx.markComplete();
      return;
    }
    const labels = ["(none)", ...teams.map((t) => formatTeamLabel(t))];
    this.selector = new FuzzySelector({
      label: "Default team",
      items: labels,
      searchThreshold: 7,
      currentValue: this.state.defaultTeamKey
        ? formatTeamLabel(
            teams.find((t) => t.key === this.state.defaultTeamKey) ?? {
              key: this.state.defaultTeamKey,
              name: this.state.defaultTeamKey,
            },
          )
        : undefined,
      theme: this.theme,
      onSelect: (selected) => {
        if (selected === "(none)") this.state.defaultTeamKey = null;
        else
          this.state.defaultTeamKey =
            teams.find((t) => formatTeamLabel(t) === selected)?.key ?? null;
        this.wizardCtx.markComplete();
        this.wizardCtx.goNext();
        this.requestRender?.();
      },
      onDone: () => {},
    });
  }
  render(width: number): string[] {
    this.rebuild();
    if (!this.state.authInfo)
      return [
        this.theme.label(" Default Team", true),
        "",
        this.theme.hint("  Complete validation first."),
      ];
    if (!this.selector)
      return [
        this.theme.label(" Default Team", true),
        "",
        this.theme.hint("  No teams found."),
      ];
    return this.selector.render(width);
  }
  invalidate(): void {
    this.selector?.invalidate?.();
  }
  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;
    this.selector?.handleInput(data);
  }
}

class ScopeStep implements Component {
  private index = 0;
  private scopes: Scope[] = ["global", "local"];
  constructor(
    private state: AuthWizardState,
    private theme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    this.index = Math.max(0, this.scopes.indexOf(state.scope));
    wizardCtx.markComplete();
  }
  render(): string[] {
    const lines = [this.theme.label(" Save to", true), ""];
    for (let i = 0; i < this.scopes.length; i++) {
      const s = this.scopes[i] as string;
      const selected = i === this.index;
      const text = `${selected ? "(o)" : "( )"} ${s}`;
      lines.push(
        `  ${selected ? this.theme.value(text, true) : this.theme.hint(text)}`,
      );
    }
    lines.push("", this.theme.hint("  Up/Down: select · Ctrl+S: save"));
    return lines;
  }
  invalidate(): void {}
  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      this.index = this.index === 0 ? 1 : 0;
      this.state.scope = this.scopes[this.index] ?? "global";
    }
  }
}

export function createAuthWizardComponent(
  options: CreateAuthWizardOptions,
): Component {
  const settingsTheme = options.settingsTheme ?? getSettingsListTheme();
  const state: AuthWizardState = {
    scope: options.prefill?.scope ?? "global",
    apiKey: options.prefill?.apiKey ?? "",
    authInfo: null,
    authError: null,
    validating: false,
    defaultTeamKey: options.prefill?.defaultTeamKey ?? null,
  };

  return new Wizard({
    title: "Linear Auth",
    theme: options.theme,
    minContentHeight: 12,
    onComplete: async () => {
      if (!state.apiKey) return;
      const workspaceKey = state.authInfo?.workspaceKey ?? "default";
      const profile: WorkspaceProfile = {
        apiKey: state.apiKey,
        orgName: state.authInfo?.orgName,
        defaultTeamKey: state.defaultTeamKey ?? undefined,
      };
      try {
        await saveWorkspace(
          state.scope,
          workspaceKey,
          profile,
          options.prefill?.oldWorkspaceKey,
        );
        clearClients();
        clearTeamCache();
        options.notify?.(
          `Saved ${workspaceLabel(workspaceKey, profile)} in ${state.scope}.`,
          "info",
        );
        options.onDone(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.notify?.(`Save failed: ${message}`, "error");
      }
    },
    onCancel: () => options.onDone(false),
    steps: [
      {
        label: "Key",
        build: (wizardCtx) => new ApiKeyStep(state, settingsTheme, wizardCtx),
      },
      {
        label: "Validate",
        build: (wizardCtx) =>
          new ValidateStep(
            state,
            settingsTheme,
            wizardCtx,
            options.requestRender,
          ),
      },
      {
        label: "Team",
        build: (wizardCtx) =>
          new DefaultTeamStep(
            state,
            settingsTheme,
            wizardCtx,
            options.requestRender,
          ),
      },
      {
        label: "Scope",
        build: (wizardCtx) => new ScopeStep(state, settingsTheme, wizardCtx),
      },
    ],
  });
}

export async function runAuthWizard(
  ctx: ExtensionCommandContext,
  prefill?: AuthWizardPrefill,
): Promise<boolean> {
  const saved = await ctx.ui.custom<boolean>((tui, theme, _kb, done) => {
    const wizard = createAuthWizardComponent({
      theme,
      prefill,
      requestRender: () => tui.requestRender(),
      notify: ctx.ui.notify,
      onDone: done,
    });
    return {
      render: (w: number) => wizard.render(w),
      invalidate: () => wizard.invalidate?.(),
      handleInput: (data: string) => {
        wizard.handleInput?.(data);
        tui.requestRender();
      },
    };
  });
  if (saved === undefined) {
    ctx.ui.notify("linear:auth requires interactive TUI mode.", "warning");
    return false;
  }
  return saved;
}
