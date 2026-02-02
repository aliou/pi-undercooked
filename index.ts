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
    parameters: Type.Object({
      message: Type.String({ description: "Message to echo" }),
    }),
    // 0.50.x signature: (toolCallId, params, onUpdate, ctx, signal)
    async execute(
      _toolCallId: string,
      params: { message: string },
      _onUpdate: unknown,
      _ctx: ExtensionContext,
      _signal?: AbortSignal,
    ) {
      return {
        content: [{ type: "text" as const, text: `Cool: ${params.message}` }],
        details: {},
      };
    },
    renderCall(args: { message: string }, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("cool_tool")) +
          " " +
          theme.fg("muted", args.message),
        0,
        0,
      );
    },
  });

  pi.registerCommand("cool", {
    description: "Say something cool",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Cool: ${args || "nothing"}`, "info");
    },
  });
}
