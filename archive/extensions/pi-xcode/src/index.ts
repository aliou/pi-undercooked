import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands/index";
import { registerRenderers } from "./components/index";
import { configLoader } from "./config";
import { registerHooks } from "./hooks/index";
import { registerProviders } from "./providers/index";
import { registerTools } from "./tools/index";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();

  if (!config.enabled) {
    return;
  }

  registerHooks(pi);
  registerTools(pi);
  registerCommands(pi);
  registerRenderers(pi);
  registerProviders(pi);
}
