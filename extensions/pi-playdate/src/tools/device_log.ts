import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { truncateTail } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { findDevice, readDeviceLog } from "../lib/device";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  seconds: Type.Optional(
    Type.Number({
      description: "How long to listen to device output.",
      default: 10,
    }),
  ),
  grep: Type.Optional(
    Type.String({ description: "Filter log lines by pattern" }),
  ),
});

type DeviceLogParams = Static<typeof parameters>;

interface DeviceLogDetails {
  lines: string[];
  port: string;
  durationMs: number;
}

export function createDeviceLogTool(pi: ExtensionAPI, state: RuntimeState) {
  return {
    name: "playdate_device_log",
    label: "Playdate Device Log",
    description:
      "Read serial log output from a connected Playdate device for a short period.",
    promptSnippet: "Read Playdate device log output",
    promptGuidelines: [
      "Use playdate_device_log to capture print() output from a connected Playdate device while reproducing a hardware-only issue.",
      "Run it right after launching the game on device, or while the bug is happening.",
      "If output is empty, the game may not have printed anything on the device path.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: DeviceLogParams,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<DeviceLogDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<DeviceLogDetails>> {
      const device = findDevice();
      const port = state.lastDevicePort ?? device.port;
      if (!port) {
        throw new Error(
          "No Playdate device connected. Connect via USB and try again.",
        );
      }

      const durationMs = Math.max(1, Math.round((params.seconds ?? 10) * 1000));
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Listening to ${port} for ${durationMs}ms...`,
          },
        ],
        details: {
          lines: [],
          port,
          durationMs,
        },
      });

      let lines = await readDeviceLog(pi, port, durationMs, { signal });

      if (params.grep) {
        const pattern = new RegExp(params.grep, "i");
        lines = lines.filter((line) => pattern.test(line));
      }

      const truncated = truncateTail(lines.join("\n"));

      return {
        content: [
          {
            type: "text",
            text:
              truncated.content ||
              "(no device serial output captured; add print() calls in the game to emit logs)",
          },
        ],
        details: {
          lines,
          port,
          durationMs,
        },
      };
    },

    renderCall(args: DeviceLogParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.seconds) {
        optionArgs.push({ label: "seconds", value: `${args.seconds}` });
      }
      if (args.grep) {
        optionArgs.push({ label: "grep", value: `"${args.grep}"` });
      }

      return new ToolCallHeader(
        {
          toolName: "Playdate Device Log",
          mainArg: "",
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<DeviceLogDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Device Log: listening..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.port) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const fields = [
        { label: "Port", value: details.port, showCollapsed: true },
        {
          label: "Lines",
          value: `${details.lines.length}`,
          showCollapsed: true,
        },
      ];

      const footerItems = [{ label: "time", value: `${details.durationMs}ms` }];

      return new ToolBody(
        {
          fields,
          footer: new ToolFooter(theme, {
            items: footerItems,
            separator: " | ",
          }),
          includeSpacerBeforeFooter: true,
        },
        options,
        theme,
      );
    },
  };
}

export function registerDeviceLogTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createDeviceLogTool(pi, state));
}
