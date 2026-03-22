import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getTrackedSessionsForPiSession } from "../utils/sessions";

/**
 * On pi shutdown, stop only crit daemons started via this extension in this cwd.
 */
export function setupCleanupHook(pi: ExtensionAPI): void {
  pi.on("session_shutdown", async (_event, ctx) => {
    const piSessionId = ctx.sessionManager.getSessionId();
    const sessions = getTrackedSessionsForPiSession(piSessionId, ctx.cwd);

    for (const session of sessions) {
      const args = ["stop", ...session.files];
      try {
        await pi.exec("crit", args, { cwd: ctx.cwd, timeout: 5000 });
      } catch {
        // Ignore: daemon already gone, crit missing, or shutdown race.
      }
    }
  });
}
