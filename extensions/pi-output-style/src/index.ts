import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands/index";
import { configLoader } from "./config";
import { registerHooks } from "./hooks/index";
import { setActiveStyle, setLoadedStyles } from "./state";
import { loadStyles } from "./styles/loader";

export default async function (pi: ExtensionAPI) {
  // Load configuration
  await configLoader.load();
  const config = configLoader.getConfig();

  if (!config.enabled) {
    return;
  }

  // Register flag for command-line style override
  pi.registerFlag("output-style", {
    type: "string",
    description: "Override the active output style",
  });

  // Load styles from all sources
  const styles = await loadStyles(process.cwd());
  setLoadedStyles(styles);

  // Apply flag override or persisted config
  const flagValue = pi.getFlag("output-style") as string | undefined;
  if (flagValue) {
    setActiveStyle(flagValue);
  } else if (config.activeStyle && config.activeStyle !== "off") {
    setActiveStyle(config.activeStyle);
  }

  // Register hooks and commands
  registerHooks(pi);
  registerCommands(pi);
}
