import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configureLinearClient } from "../../src/client";
import { configureTeamCache } from "../../src/teams";
import { registerLinearAuth } from "./commands/auth";
import { registerLinearBrowser } from "./commands/browser";
import { registerLinearSettings } from "./commands/settings";
import { registerLinearStart } from "./commands/start";
import {
  configLoader,
  hasLinearCredentials,
  LINEAR_CREDENTIALS_ERROR,
} from "./config";
import { registerHooks } from "./hooks";
import { registerTools } from "./tools";

export default async function linearExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();

  if (!config.enabled) return;

  configureLinearClient((workspace) => {
    const resolved = configLoader.getConfig();
    const activeWorkspace = workspace ?? resolved.activeWorkspace;
    return {
      activeWorkspace,
      apiKey: workspace
        ? (resolved.workspaces[workspace]?.apiKey ?? process.env.LINEAR_API_KEY)
        : resolved.apiKey,
    };
  });
  configureTeamCache(() => {
    const resolved = configLoader.getConfig();
    return {
      activeWorkspace: resolved.activeWorkspace,
      defaultTeamKey: resolved.defaultTeamKey,
    };
  });

  registerLinearAuth(pi);
  registerLinearSettings(pi);
  registerLinearStart(pi);
  registerLinearBrowser(pi);

  if (!hasLinearCredentials()) {
    pi.on("session_start", (_event, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(LINEAR_CREDENTIALS_ERROR, "warning");
      }
    });
    return;
  }

  registerHooks(pi);
  registerTools(pi);
}
