import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Cool extension loaded!", "info");
  });

  pi.registerTool({
    name: "cool_tool",
    label: "Cool Tool",
    description: "A cool tool that does cool things",
    parameters: Type.Object({}),
    // 0.51.0 signature: (toolCallId, params, signal, onUpdate, ctx)
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      onUpdate: ((result: { content: { type: "text"; text: string }[] }) => void) | undefined,
      _ctx: ExtensionContext,
    ) {
      onUpdate?.({ content: [{ type: "text", text: "Thinking coolly..." }] });
      await new Promise((r) => setTimeout(r, 500));
      onUpdate?.({ content: [{ type: "text", text: "Almost done being cool..." }] });
      await new Promise((r) => setTimeout(r, 500));
      return {
        content: [{ type: "text" as const, text: "Cool stuff done!" }],
        details: {},
      };
    },
    renderCall(_args: Record<string, never>, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("cool_tool")), 0, 0);
    },
  });

  pi.registerCommand("cool", {
    description: "Say something cool",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Cool: ${args || "nothing"}`, "info");
    },
  });
}
