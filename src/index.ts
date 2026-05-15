import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { hasLinearCredentials, LINEAR_CREDENTIALS_ERROR } from "./client";
import { registerLinearAuth } from "./commands/auth";
import { registerLinearBrowser } from "./commands/browser";
import { registerLinearSettings } from "./commands/settings";
import { registerLinearStart } from "./commands/start";
import { configLoader } from "./config";
import { registerHooks } from "./hooks";
import { registerTools } from "./tools/index";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();

  if (!config.enabled) return;

  // Always register auth + settings so users can manage credentials.
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
