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
import { type BuildDetails, createBuildTool, executeBuild } from "./build";

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
});

interface BuildReleaseParams {
  projectPath?: string;
  target?: string;
  clean?: boolean;
}

export function createBuildReleaseTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  const baseTool = createBuildTool(pi, config, state);

  return {
    ...baseTool,
    name: "playdate_build_release",
    label: "Playdate Build Release",
    description:
      "Build a Playdate project in release mode. Lua builds are stripped with pdc -s.",
    promptSnippet: "Compile Playdate project to .pdx bundle in release mode",
    parameters,

    async execute(
      _toolCallId: string,
      params: BuildReleaseParams,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<BuildDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const projectPath = params.projectPath || ctx.cwd;
      const rawTarget = params.target || config.defaultTarget;
      const target: "simulator" | "device" =
        rawTarget === "device" ? "device" : "simulator";

      return executeBuild(
        pi,
        config,
        state,
        projectPath,
        target,
        params.clean ?? false,
        signal,
        {
          buildMode: "release",
          stripLua: true,
        },
      );
    },

    renderCall(args: BuildReleaseParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.target) optionArgs.push({ label: "target", value: args.target });
      if (args.clean) optionArgs.push({ label: "clean", value: "true" });
      optionArgs.push({ label: "mode", value: "release" });

      return new ToolCallHeader(
        {
          toolName: "Playdate Build Release",
          mainArg: args.projectPath || "",
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },
  };
}

export function registerBuildReleaseTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerTool(createBuildReleaseTool(pi, config, state));
}
