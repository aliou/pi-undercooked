import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/**
 * Action-oriented header for all FlowDeck tools.
 * Pattern: "FlowDeck: <tool> <action> [suffix]"
 *
 * Examples:
 *   FlowDeck: build
 *   FlowDeck: run `MyApp`
 *   FlowDeck: simulator list
 *   FlowDeck: ui tap "Continue"
 */
export class FlowDeckActionHeader extends Text {
  constructor(
    tool: string,
    action: string,
    theme: Theme,
    options?: { suffix?: string; expanded?: boolean },
  ) {
    // Avoid "build build" — collapse when tool and action are the same
    const label = tool === action ? tool : `${tool} ${action}`;

    const parts = [
      theme.fg("toolTitle", theme.bold("FlowDeck:")),
      theme.fg("muted", label),
    ];

    if (options?.suffix) {
      parts.push(options.suffix);
    }

    super(parts.join(" "), 0, 0);
  }
}
