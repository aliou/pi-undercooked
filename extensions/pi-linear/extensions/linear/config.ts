import {
  buildSchemaUrl,
  ConfigLoader,
  type Migration,
} from "@aliou/pi-utils-settings";
import pkg from "../../package.json" with { type: "json" };

export interface WorkspaceProfile {
  /** Linear API key for this workspace. */
  apiKey?: string;
  /** Human-readable org name. */
  orgName?: string;
  /** Preferred default team key (e.g. ENG). */
  defaultTeamKey?: string;
}

/**
 * Raw config shape (what gets saved to disk).
 * All fields optional -- only overrides are stored.
 *
 * JSDoc comments on fields become `description` in the generated JSON Schema.
 * Run `pnpm gen:schema` after changing this interface.
 */
export type StartDecisionMode = "ask" | "true" | "false";

export interface LinearConfig {
  /** Enable or disable the extension. */
  enabled?: boolean;
  /** Workspace profiles keyed by Linear org urlKey. */
  workspaces?: Record<string, WorkspaceProfile>;
  /** Default workspace key to use for tools and defaults. */
  defaultWorkspace?: string;
  /** Whether issue start should update tracker state by default: ask, true, false. */
  startUpdateState?: StartDecisionMode;
  /** Whether issue start should create a git branch by default: ask, true, false. */
  startCreateBranch?: StartDecisionMode;
  /** Legacy flat API key. Kept for migration detection only. */
  apiKey?: string;
}

/**
 * Resolved config (defaults merged in).
 */
export interface ResolvedLinearConfig {
  enabled: boolean;
  defaultWorkspace: string | undefined;
  activeWorkspace: string | undefined;
  apiKey: string | undefined;
  defaultTeamKey: string | undefined;
  startUpdateState: StartDecisionMode;
  startCreateBranch: StartDecisionMode;
  workspaces: Record<string, WorkspaceProfile>;
}

const DEFAULTS: ResolvedLinearConfig = {
  enabled: true,
  defaultWorkspace: undefined,
  activeWorkspace: undefined,
  apiKey: undefined,
  defaultTeamKey: undefined,
  startUpdateState: "ask",
  startCreateBranch: "ask",
  workspaces: {},
};

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

const legacyApiKeyMigration: Migration<LinearConfig> = {
  name: "legacy-flat-apikey-to-workspaces",
  shouldRun: (config) => Boolean(config.apiKey && !config.workspaces),
  run: (config) => {
    if (!config.apiKey || config.workspaces) return config;
    const migrated: LinearConfig = structuredClone(config);
    migrated.workspaces = {
      default: {
        apiKey: config.apiKey,
      },
    };
    migrated.defaultWorkspace = "default";
    delete migrated.apiKey;
    return migrated;
  },
};

function pickActiveWorkspace(
  workspaces: Record<string, WorkspaceProfile>,
  preferred?: string,
): string | undefined {
  if (preferred && workspaces[preferred]) return preferred;

  const withApiKey = Object.entries(workspaces).find(([, profile]) =>
    Boolean(profile.apiKey),
  );
  if (withApiKey) return withApiKey[0];

  return Object.keys(workspaces)[0];
}

/**
 * Config loader instance.
 * Config is stored at ~/.pi/agent/extensions/linear.json
 */
export const configLoader = new ConfigLoader<
  LinearConfig,
  ResolvedLinearConfig
>("linear", DEFAULTS, {
  schemaUrl,
  migrations: [legacyApiKeyMigration],
  afterMerge: (resolved) => {
    const workspaces = resolved.workspaces ?? {};
    const activeWorkspace = pickActiveWorkspace(
      workspaces,
      resolved.defaultWorkspace,
    );
    const profile = activeWorkspace ? workspaces[activeWorkspace] : undefined;

    return {
      ...resolved,
      workspaces,
      activeWorkspace,
      apiKey: profile?.apiKey ?? process.env.LINEAR_API_KEY,
      defaultTeamKey: profile?.defaultTeamKey,
    };
  },
});

export function hasLinearCredentials(): boolean {
  const config = configLoader.getConfig();
  if (process.env.LINEAR_API_KEY) return true;
  return Object.values(config.workspaces).some(
    (workspace) => !!workspace.apiKey,
  );
}

export const LINEAR_CREDENTIALS_ERROR = [
  "Linear API key not configured. Set it via:",
  "",
  "  1. /linear:auth command",
  "  2. /linear:settings command",
  "  3. Environment variable: export LINEAR_API_KEY=lin_api_...",
  "",
  "Get a key at: https://linear.app/settings/api",
].join("\n");
