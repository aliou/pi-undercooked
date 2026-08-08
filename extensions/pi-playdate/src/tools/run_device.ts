import { cp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import type { ResolvedPlaydateConfig } from "../config";
import {
  enterDataDiskMode,
  findDevice,
  findPdutil,
  getDataDiskMountPath,
  runOnDevice,
  waitForVolume,
} from "../lib/device";
import { findPdxBundle } from "../lib/project";
import { resolveSDKPath } from "../lib/sdk";
import type { RuntimeState } from "../lib/state";

const parameters = Type.Object({
  pdxPath: Type.Optional(
    Type.String({
      description:
        "Path to .pdx bundle. Defaults to last build or auto-detect.",
    }),
  ),
});

type RunDeviceParams = Static<typeof parameters>;

export interface RunDeviceDetails {
  port: string;
  volumePath: string;
  pdxName: string;
  durationMs: number;
  launched: boolean;
}

export async function executeRunDevice(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
  pdxPath: string | undefined,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<RunDeviceDetails>> {
  const start = Date.now();
  const sdkPath = resolveSDKPath(config);
  const pdutilPath = findPdutil(sdkPath);

  let resolvedPdxPath = pdxPath;
  if (!resolvedPdxPath && state.lastBuildResult) {
    resolvedPdxPath = state.lastBuildResult.pdxPath;
  }
  if (!resolvedPdxPath) {
    resolvedPdxPath = findPdxBundle(ctx.cwd) ?? undefined;
  }
  if (!resolvedPdxPath) {
    throw new Error(
      "No .pdx bundle found. Build the project first with playdate_build.",
    );
  }

  const pdxName = basename(resolvedPdxPath);

  const device = findDevice();
  if (!device.connected || !device.port) {
    throw new Error(
      "No Playdate device connected. Connect via USB and try again.",
    );
  }

  const port = device.port;
  state.lastDevicePort = port;

  await enterDataDiskMode(pi, pdutilPath, port, { signal });

  const volumePath = getDataDiskMountPath();
  await waitForVolume(volumePath, 30000, signal);

  const destPath = join(volumePath, "Games", pdxName);
  await rm(destPath, { recursive: true, force: true });
  await cp(resolvedPdxPath, destPath, { recursive: true });

  await pi.exec("sync", [], { signal });

  if (process.platform === "darwin") {
    await pi.exec("diskutil", ["eject", volumePath], { signal });
  } else if (process.platform === "linux") {
    await pi.exec("umount", [volumePath], { signal });
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await runOnDevice(pi, pdutilPath, port, `/Games/${pdxName}`, { signal });

  ctx.ui.notify(`${pdxName} deployed and launched`, "info");

  const durationMs = Date.now() - start;

  return {
    content: [
      {
        type: "text",
        text: `Deployed ${pdxName} to device (${durationMs}ms)`,
      },
    ],
    details: {
      port,
      volumePath,
      pdxName,
      durationMs,
      launched: true,
    },
  };
}

export function createRunDeviceTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  return {
    name: "playdate_run_device",
    label: "Playdate Run Device",
    description: "Deploy and run a .pdx bundle on a connected Playdate device.",
    promptSnippet: "Deploy game to connected Playdate device",
    promptGuidelines: [
      "playdate_run_device requires a Playdate connected via USB.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: RunDeviceParams,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<RunDeviceDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<RunDeviceDetails>> {
      return executeRunDevice(pi, config, state, params.pdxPath, signal, ctx);
    },

    renderCall(args: RunDeviceParams, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Run Device",
          mainArg: args.pdxPath || "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<RunDeviceDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Run Device: deploying..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.pdxName) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Deployment failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      if (!details.launched) {
        return new Text(theme.fg("muted", "Deployment cancelled"), 0, 0);
      }

      const fields = [
        { label: "Game", value: details.pdxName, showCollapsed: true },
        { label: "Port", value: details.port, showCollapsed: true },
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

export function registerRunDeviceTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerTool(createRunDeviceTool(pi, config, state));
}
