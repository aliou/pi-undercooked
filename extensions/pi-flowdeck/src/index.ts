import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands/index";
import { configLoader } from "./config";
import { registerHooks } from "./hooks/index";
import { registerTools } from "./tools/index";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  registerCommands(pi);

  const config = configLoader.getConfig();
  if (!config.enabled) return;

  registerHooks(pi);
  registerTools(pi);
}
