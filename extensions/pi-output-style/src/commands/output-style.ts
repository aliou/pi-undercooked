import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";
import { configLoader } from "../config";
import {
  getActiveStyle,
  getLoadedStyles,
  getStyleNames,
  isValidStyle,
  setActiveStyle,
} from "../state";
import { OFF_STYLE } from "../styles/types";

interface StyleSwitchDetails {
  styleName: string;
  action: "activated" | "deactivated";
  description?: string;
  prompt?: string;
}

/**
 * Register the /output-style command.
 */
export function registerOutputStyleCommand(pi: ExtensionAPI) {
  // Register message renderer for style switch notifications
  pi.registerMessageRenderer(
    "output-style-switch",
    (message, { expanded }, theme) => {
      const details = message.details as StyleSwitchDetails | undefined;
      const styleName = details?.styleName ?? "Unknown";
      const action = details?.action ?? "activated";
      const description = details?.description;
      const prompt = details?.prompt;

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));

      // Header + description as a single text block (paddingX=0, paddingY=0)
      const headerLine =
        action === "deactivated"
          ? theme.fg("muted", "Output style: off")
          : theme.fg("accent", `Output style: ${styleName}`);

      let headerBlock = headerLine;
      if (action === "activated" && description) {
        headerBlock += `\n${theme.fg("muted", description)}`;
      }
      box.addChild(new Text(headerBlock, 0, 0));

      // Expanded: show full prompt using Markdown
      if (expanded && action === "activated" && prompt) {
        const mdTheme = getMarkdownTheme();
        box.addChild(new Markdown(prompt.trim(), 0, 1, mdTheme));
      }

      return box;
    },
  );

  pi.registerCommand("output-style", {
    description: "Manage output styles for customizing the agent's responses",
    getArgumentCompletions: (
      argumentPrefix: string,
    ): AutocompleteItem[] | null => {
      const names = getStyleNames();
      const allNames = [...names, OFF_STYLE];
      const filtered = allNames.filter((name) =>
        name.toLowerCase().startsWith(argumentPrefix.toLowerCase()),
      );
      return filtered.map((name) => ({ value: name, label: name }));
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();

      if (!trimmed) {
        await showStylePicker(ctx, pi);
        return;
      }

      if (trimmed === OFF_STYLE) {
        await deactivateStyle(ctx, pi);
        return;
      }

      await switchStyle(trimmed, ctx, pi);
    },
  });
}

/**
 * Show a picker to select a style.
 */
async function showStylePicker(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const styles = getLoadedStyles();
  const activeStyle = getActiveStyle();

  const choices: string[] = [];
  choices.push(OFF_STYLE + (activeStyle ? "" : " (active)"));

  const names = getStyleNames();
  for (const name of names) {
    const style = styles.get(name.toLowerCase());
    const marker = activeStyle?.name === name ? " (active)" : "";
    const desc = style?.description ? ` - ${style.description}` : "";
    choices.push(`${name}${marker}${desc}`);
  }

  if (ctx.hasUI) {
    const selected = await ctx.ui.select("Select output style", choices);

    if (selected) {
      const styleName = selected.split(" (active)")[0].split(" - ")[0];
      if (styleName === OFF_STYLE) {
        await deactivateStyle(ctx, pi);
      } else {
        await switchStyle(styleName, ctx, pi);
      }
    }
  } else {
    console.log("Available output styles:");
    console.log("");
    console.log(`  ${OFF_STYLE}${activeStyle ? "" : " (active)"}`);
    for (const name of names) {
      const style = styles.get(name.toLowerCase());
      const marker = activeStyle?.name === name ? " (active)" : "";
      const desc = style?.description ? ` - ${style.description}` : "";
      console.log(`  ${name}${marker}${desc}`);
    }
    console.log("");
    console.log("Use /output-style <name> to switch styles.");
  }
}

async function switchStyle(
  name: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!isValidStyle(name)) {
    ctx.ui.notify(`Unknown output style: ${name}`, "error");
    return;
  }

  const success = setActiveStyle(name);
  if (!success) {
    ctx.ui.notify(`Failed to activate style: ${name}`, "error");
    return;
  }

  await configLoader.save("global", { activeStyle: name.toLowerCase() });

  const styles = getLoadedStyles();
  const style = styles.get(name.toLowerCase());

  pi.sendMessage({
    customType: "output-style-switch",
    content: `Output style: ${name}`,
    display: true,
    details: {
      styleName: name,
      action: "activated",
      description: style?.description,
      prompt: style?.prompt,
    },
  });
}

async function deactivateStyle(
  _ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  setActiveStyle(OFF_STYLE);

  await configLoader.save("global", { activeStyle: OFF_STYLE });

  pi.sendMessage({
    customType: "output-style-switch",
    content: "Output style: off",
    display: true,
    details: { styleName: OFF_STYLE, action: "deactivated" },
  });
}
