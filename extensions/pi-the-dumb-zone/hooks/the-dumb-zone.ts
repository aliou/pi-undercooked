import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { checkDumbZone } from "../checks";
import {
  clearDumbZoneWidget,
  maybeNotifyDumbZone,
  resetDumbZoneWidgetState,
  showDumbZoneWidget,
} from "../widget";

/**
 * Setup the dumb zone detection hook.
 * Runs checks after each agent turn and keeps the widget in sync.
 */
export function setupDumbZoneHook(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    resetDumbZoneWidgetState();
    clearDumbZoneWidget(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetDumbZoneWidgetState();
    clearDumbZoneWidget(ctx);
  });

  pi.on("agent_end", async (event, ctx) => {
    const result = checkDumbZone(ctx, event.messages);

    if (!result.inZone) {
      clearDumbZoneWidget(ctx);
      return;
    }

    showDumbZoneWidget(ctx, result);
    maybeNotifyDumbZone(ctx, result);
  });
}
