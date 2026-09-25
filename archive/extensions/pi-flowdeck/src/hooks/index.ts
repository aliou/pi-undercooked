import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../config";
import { hasResult } from "../tools/utils";

/**
 * Hook extension entry point.
 * Injects FlowDeck guidance into the system prompt and marks failed FlowDeck
 * tool calls as errors.
 */
export default async function hooksExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;

  // Pi's agent loop hardcodes `isError: false` for any tool that returns
  // normally, and throwing would discard `details`. This hook is the only way
  // to flag a failed FlowDeck command while keeping the structured result the
  // renderers depend on.
  pi.on("tool_result", async (event) => {
    if (!event.toolName.startsWith("flowdeck_")) return;
    if (!hasResult(event.details)) return;
    return { isError: !event.details.result.ok };
  });

  // Inject short, always-on guidance about FlowDeck.
  // The full skill documentation covers workflows, validation policy, and examples.
  pi.on("before_agent_start", async (event) => {
    const guidance = [
      "",
      "## FlowDeck - Apple Platform Tools",
      "",
      "FlowDeck is the preferred interface for Apple platform (iOS/macOS/tvOS/watchOS/visionOS) build, run, test, simulator, device, and UI automation tasks.",
      "",
      "Rules:",
      "- Use FlowDeck tools (flowdeck_build, flowdeck_run, flowdeck_test, flowdeck_simulator, flowdeck_ui_simulator, flowdeck_ui_mac, etc.) instead of xcodebuild, xcrun simctl, xcrun devicectl, instruments, log show, log stream, or any other Apple CLI.",
      "- Check flowdeck_config with action get before any build/run/test to use saved settings.",
      "- For iOS simulator work, auto-validate by default: build -> run -> UI session -> verify. No permission needed.",
      "- For macOS work, ask the user once before auto-validating (run + UI sessions take focus and control mouse/keyboard).",
      "- Start a UI session (flowdeck_session action=start platform=ios or flowdeck_session action=start platform=mac) before any UI automation.",
      "- After every UI action, verify by re-reading the screenshot/tree files.",
      "- Never use xcrun for logs. Use flowdeck_run with action logs instead.",
      "- If a FlowDeck command fails with a license error, tell the user to visit flowdeck.studio/cli/purchase/.",
      "",
    ].join("\n");

    return {
      systemPrompt: `${event.systemPrompt}\n${guidance}`,
    };
  });
}
