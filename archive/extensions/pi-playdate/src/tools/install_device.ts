import { ToolCallHeader } from "@aliou/pi-utils-ui";
import { StringEnum } from "@mariozechner/pi-ai";
import type {
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ResolvedPlaydateConfig } from "../config";
import type { RuntimeState } from "../lib/state";
import { executeBuild } from "./build";
import {
  createRunDeviceTool,
  executeRunDevice,
  type RunDeviceDetails,
} from "./run_device";

const parameters = Type.Object({
  projectPath: Type.Optional(
    Type.String({ description: "Path to the project root. Defaults to cwd." }),
  ),
  target: Type.Optional(
    StringEnum(["simulator", "device"], { description: "Build target" }),
  ),
  clean: Type.Optional(
    Type.Boolean({
      description: "Clean build directory before building",
      default: false,
    }),
  ),
  release: Type.Optional(
    Type.Boolean({
      description:
        "Build in release mode. Lua builds are stripped with pdc -s.",
      default: true,
    }),
  ),
});

interface InstallDeviceParams {
  projectPath?: string;
  target?: string;
  clean?: boolean;
  release?: boolean;
}

export function createInstallDeviceTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  const baseTool = createRunDeviceTool(pi, config, state);

  return {
    ...baseTool,
    name: "playdate_install_device",
    label: "Playdate Install Device",
    description:
      "Build the current Playdate project, then deploy and launch it on a connected device.",
    promptSnippet: "Build, deploy, and run game on connected Playdate",
    parameters,

    async execute(
      _toolCallId: string,
      params: InstallDeviceParams,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<RunDeviceDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const projectPath = params.projectPath || ctx.cwd;
      const rawTarget = params.target || "simulator";
      const target: "simulator" | "device" =
        rawTarget === "device" ? "device" : "simulator";
      const release = params.release ?? true;

      await executeBuild(
        pi,
        config,
        state,
        projectPath,
        target,
        params.clean ?? false,
        signal,
        release
          ? {
              buildMode: "release",
              stripLua: true,
            }
          : undefined,
      );

      return executeRunDevice(
        pi,
        config,
        state,
        state.lastBuildResult?.pdxPath,
        signal,
        ctx,
      );
    },

    renderCall(args: InstallDeviceParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.target) optionArgs.push({ label: "target", value: args.target });
      if (args.clean) optionArgs.push({ label: "clean", value: "true" });
      optionArgs.push({ label: "release", value: `${args.release ?? true}` });

      return new ToolCallHeader(
        {
          toolName: "Playdate Install Device",
          mainArg: args.projectPath || "",
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },
  };
}

export function registerInstallDeviceTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerTool(createInstallDeviceTool(pi, config, state));
}
