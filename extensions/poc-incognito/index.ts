/**
 * Incognito Mode Extension
 *
 * Registers the --incognito flag. When enabled, sessions are saved to
 * a configurable directory instead of the default sessions location.
 *
 * Settings (via @aliou/pi-utils-settings):
 * - incognitoDirectory: Required directory to store incognito sessions
 *
 * UI: Shows "incognito" in the editor border when enabled.
 */

import { promises as fs } from "node:fs";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { ConfigLoader, registerSettingsCommand } from "@aliou/pi-utils-settings";

// --- Config Types ---

export interface IncognitoConfig {
  incognitoDirectory: string;
}

export interface ResolvedIncognitoConfig {
  incognitoDirectory: string;
}

// --- Config Loader ---

export const configLoader = new ConfigLoader<IncognitoConfig, ResolvedIncognitoConfig>(
  "incognito",
  { incognitoDirectory: "" },
  {
    scopes: ["global", "local"],
  },
);

// --- Custom Editor ---

class IncognitoEditor extends CustomEditor {
  public incognitoProvider?: () => boolean;
  public defaultColor: (text: string) => string = (t) => t;
  public incognitoColor: (text: string) => string = (t) => t;
  private _borderColor?: (text: string) => string;
  private locked = false;

  constructor(
    tui: ConstructorParameters<typeof CustomEditor>[0],
    theme: ConstructorParameters<typeof CustomEditor>[1],
    keybindings: ConstructorParameters<typeof CustomEditor>[2],
  ) {
    super(tui, theme, keybindings);

    delete (this as { borderColor?: (text: string) => string }).borderColor;
    Object.defineProperty(this, "borderColor", {
      get: () => this._borderColor ?? ((text: string) => text),
      set: (value: (text: string) => string) => {
        if (this.locked) return;
        this._borderColor = value;
      },
      configurable: true,
      enumerable: true,
    });
  }

  lockBorderColor() {
    this.locked = true;
  }

  render(width: number): string[] {
    const isIncognito = this.incognitoProvider?.();
    const color = isIncognito ? this.incognitoColor : this.defaultColor;

    this.locked = false;
    this.borderColor = color;
    this.locked = true;

    const lines = super.render(width);

    if (!isIncognito || width < 15) return lines;

    const label = "incognito";
    const prefix = "── ";
    const suffix = " ";
    const fillLen = width - prefix.length - label.length - suffix.length;
    if (fillLen < 1) return lines;

    const fill = "─".repeat(fillLen);

    lines[0] = color(prefix) + color(label) + color(suffix + fill);

    return lines;
  }

  requestRenderNow(): void {
    this.tui.requestRender();
  }
}

// --- Entry Point ---

export default async function activate(pi: ExtensionAPI): Promise<void> {
  // Load config
  await configLoader.load();
  const config = configLoader.getConfig();

  let requestRender: (() => void) | undefined;

  // Check if directory is configured
  if (!config.incognitoDirectory) {
    pi.registerFlag("incognito", {
      type: "boolean",
      description: "Save sessions to incognito directory (run /incognito:settings first to configure)",
      default: false,
    });

    registerIncognitoSettings(pi, () => requestRender);

    return;
  }

  // Ensure directory exists
  await fs.mkdir(config.incognitoDirectory, { recursive: true });

  // Register the --incognito flag
  pi.registerFlag("incognito", {
    type: "boolean",
    description: "Save sessions to incognito directory instead of default location",
    default: false,
  });

  // Toggle command - enables/disables incognito and triggers immediate render
  pi.registerCommand("incognito", {
    description: "Toggle incognito mode",
    handler: async (_args, ctx) => {
      const current = pi.getFlag("incognito") as boolean;
      // Toggle the flag
      pi.registerFlag("incognito", {
        type: "boolean",
        description: "Save sessions to incognito directory instead of default location",
        default: !current,
      });
      // Force immediate render
      requestRender?.();
      ctx.ui.notify(current ? "Incognito mode disabled" : "Incognito mode enabled", "info");
    },
  });

  // Register settings command
  registerIncognitoSettings(pi, () => requestRender);

  // Set up custom editor component immediately if UI is available
  // This ensures the indicator shows even if flag is set at startup
  pi.on("session_start", async (_event, ctx) => {
    // Always set up the editor component for visual feedback
    if (ctx.hasUI) {
      const isIncognito = pi.getFlag("incognito") as boolean;

      ctx.ui.setEditorComponent((tui, theme, _keybindings) => {
        const editor = new IncognitoEditor(tui, theme, _keybindings);
        requestRender = () => editor.requestRenderNow();
        editor.incognitoProvider = () => pi.getFlag("incognito") as boolean;
        editor.defaultColor = (text: string) => ctx.ui.theme.fg("borderMuted", text);
        editor.incognitoColor = (text: string) => ctx.ui.theme.fg("borderAccent", text);
        editor.lockBorderColor();
        return editor;
      });

      // If flag is already enabled at startup, force render
      if (isIncognito) {
        requestRender?.();
      }
    }

    // Redirect session file if incognito is enabled
    if (!pi.getFlag("incognito")) {
      return;
    }

    const currentSessionFile = ctx.sessionManager.getSessionFile();
    if (!currentSessionFile) {
      return;
    }

    const incognitoDir = configLoader.getConfig().incognitoDirectory;
    await fs.mkdir(incognitoDir, { recursive: true });

    const filename = basename(currentSessionFile);
    const newSessionFile = `${incognitoDir}/incognito_${filename}`;

    (ctx.sessionManager as unknown as { setSessionFile(file: string): void }).setSessionFile(newSessionFile);
  });

  // Update session file on flag change (for new sessions created while pi is running)
  pi.on("turn_start", async (_event, ctx) => {
    if (!pi.getFlag("incognito")) {
      return;
    }

    const currentSessionFile = ctx.sessionManager.getSessionFile();
    if (!currentSessionFile || currentSessionFile.includes("/incognito_")) {
      return;
    }

    const incognitoDir = configLoader.getConfig().incognitoDirectory;
    const filename = basename(currentSessionFile);
    const newSessionFile = `${incognitoDir}/incognito_${filename}`;

    (ctx.sessionManager as unknown as { setSessionFile(file: string): void }).setSessionFile(newSessionFile);
  });
}

// --- Settings Command ---

function registerIncognitoSettings(pi: ExtensionAPI, getRequestRender: () => (() => void) | undefined): void {
  registerSettingsCommand<IncognitoConfig, ResolvedIncognitoConfig>(pi, {
    commandName: "incognito:settings",
    commandDescription: "Configure incognito mode settings",
    title: "Incognito Settings",
    configStore: configLoader,

    buildSections: (_tabConfig, resolved, _ctx) => {
      return [
        {
          label: "General",
          items: [
            {
              id: "incognitoDirectory",
              label: "Incognito directory",
              currentValue: resolved.incognitoDirectory || "(not configured)",
              description: "Directory where incognito sessions are saved (required)",
            },
          ],
        },
      ];
    },

    onSettingChange: (_id, newValue, config) => {
      if (!newValue || newValue.trim() === "") {
        return null;
      }
      return { ...config, incognitoDirectory: newValue };
    },

    onSave: async () => {
      const config = configLoader.getConfig();
      if (config.incognitoDirectory) {
        await fs.mkdir(config.incognitoDirectory, { recursive: true }).catch(console.error);
      }
      // Request render to update border if needed
      getRequestRender()?.();
    },
  });
}