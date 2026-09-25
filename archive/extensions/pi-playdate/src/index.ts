import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands/index";
import { configLoader } from "./config";
import { killSimulator } from "./lib/sim";
import { createRuntimeState } from "./lib/state";
import { registerTools } from "./tools/index";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  const state = createRuntimeState();

  registerTools(pi, config, state);
  registerCommands(pi, config, state);

  // Clean shutdown: kill simulator, clear status
  pi.on("session_shutdown", async (_event, ctx) => {
    killSimulator(state);
    ctx.ui.setStatus("playdate", "");
  });
}
