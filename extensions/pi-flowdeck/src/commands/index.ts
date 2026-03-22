import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { configLoader, type FlowdeckPiExtensionConfig } from "../config";

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function saveGlobalConfig(patch: Partial<FlowdeckPiExtensionConfig>) {
  const current = (configLoader.getRawConfig("global") ??
    {}) as FlowdeckPiExtensionConfig;
  await configLoader.save("global", { ...current, ...patch });
}

async function runInteractiveSettings(ctx: ExtensionCommandContext) {
  const config = configLoader.getConfig();

  const selected = await ctx.ui.select("FlowDeck settings", [
    `enabled: ${config.enabled ? "on" : "off"}`,
    `flowdeckExecutable: ${config.flowdeckExecutable}`,
    `defaultTimeoutSeconds: ${config.defaultTimeoutSeconds}`,
    `systemPromptGuidance: ${config.systemPromptGuidance ? "on" : "off"}`,
  ]);

  if (!selected) return;

  if (selected.startsWith("enabled:")) {
    const next = !config.enabled;
    await saveGlobalConfig({ enabled: next });
    ctx.ui.notify(`flowdeck enabled: ${next ? "on" : "off"}`, "info");
    return;
  }

  if (selected.startsWith("flowdeckExecutable:")) {
    const value = await ctx.ui.input(
      "flowdeckExecutable",
      config.flowdeckExecutable,
    );
    if (!value) return;
    await saveGlobalConfig({ flowdeckExecutable: value.trim() });
    ctx.ui.notify(`flowdeckExecutable updated: ${value.trim()}`, "info");
    return;
  }

  if (selected.startsWith("defaultTimeoutSeconds:")) {
    const value = await ctx.ui.input(
      "defaultTimeoutSeconds",
      String(config.defaultTimeoutSeconds),
    );
    if (!value) return;

    const parsed = parsePositiveInt(value.trim());
    if (!parsed) {
      ctx.ui.notify("Timeout must be a positive integer", "error");
      return;
    }

    await saveGlobalConfig({ defaultTimeoutSeconds: parsed });
    ctx.ui.notify(`defaultTimeoutSeconds updated: ${parsed}`, "info");
    return;
  }

  if (selected.startsWith("systemPromptGuidance:")) {
    const next = !config.systemPromptGuidance;
    await saveGlobalConfig({ systemPromptGuidance: next });
    ctx.ui.notify(`systemPromptGuidance: ${next ? "on" : "off"}`, "info");
  }
}

export function registerCommands(pi: ExtensionAPI) {
  pi.registerCommand("flowdeck:settings", {
    description: "Configure flowdeck extension settings",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        const cfg = configLoader.getConfig();
        console.log(JSON.stringify(cfg, null, 2));
        return;
      }

      await runInteractiveSettings(ctx);
    },
  });
}
