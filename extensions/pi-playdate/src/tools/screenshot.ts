import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import {
  type AgentToolResult,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ToolRenderResultOptions,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { DapClient } from "../lib/dap";
import { DAP_QUEUE_KEY } from "../lib/dap-queue";
import { ensureSimulatorDap } from "../lib/sim";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({});

interface ScreenshotDetails {
  path: string;
  width: number;
  height: number;
}

export function createScreenshotTool(_pi: ExtensionAPI, state: RuntimeState) {
  return {
    name: "playdate_screenshot",
    label: "Playdate Screenshot",
    description: "Take a screenshot of the running Playdate Simulator.",
    promptSnippet: "Capture screenshot from Playdate Simulator",
    parameters,

    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<ScreenshotDetails>> {
      return withFileMutationQueue(DAP_QUEUE_KEY, async () => {
        const dap = await ensureSimulatorDap(state, signal);
        return screenshotDAP(dap, signal);
      });
    },

    renderCall(_args: Record<string, never>, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Screenshot",
          mainArg: "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<ScreenshotDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Screenshot: capturing..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.path) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Screenshot failed";
        return new ToolBody(
          {
            fields: [
              {
                label: "Error",
                value: theme.fg("error", errorMsg),
                showCollapsed: true,
              },
            ],
          },
          options,
          theme,
        );
      }

      return new Text(`Screenshot saved to ${details.path}`, 0, 0);
    },
  };
}

async function screenshotDAP(
  dap: DapClient,
  signal?: AbortSignal,
): Promise<AgentToolResult<ScreenshotDetails>> {
  const outputPath = join(tmpdir(), `playdate-screenshot-${Date.now()}.png`);
  await dap.screenshot(outputPath, signal);

  // Small delay for file write to complete
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Operation aborted"),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 100);

    signal?.addEventListener("abort", abort, { once: true });
  });

  const imageData = readFileSync(outputPath);
  const base64 = imageData.toString("base64");

  return {
    content: [
      { type: "text", text: "Screenshot captured from Playdate Simulator" },
      { type: "image", data: base64, mimeType: "image/png" },
    ],
    details: { path: outputPath, width: 400, height: 240 },
  };
}

export function registerScreenshotTool(pi: ExtensionAPI, state: RuntimeState) {
  pi.registerTool(createScreenshotTool(pi, state));
}
