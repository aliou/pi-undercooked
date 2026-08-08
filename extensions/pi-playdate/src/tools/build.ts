import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import { StringEnum } from "@mariozechner/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import {
  truncateTail,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { ResolvedPlaydateConfig } from "../config";
import { cmakeBuild } from "../lib/cmake";
import { runPdc } from "../lib/pdc";
import { detectProject } from "../lib/project";
import { findPdc, resolveSDKPath } from "../lib/sdk";
import { killSimulator } from "../lib/sim";
import type { BuildResult, RuntimeState } from "../lib/state";

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

interface BuildParams {
  projectPath?: string;
  target?: string;
  clean?: boolean;
}

export interface BuildDetails extends BuildResult {
  output?: string;
}

export interface ExecuteBuildOptions {
  buildMode?: "debug" | "release";
  stripLua?: boolean;
}

export async function executeBuild(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
  projectPath: string,
  target: "simulator" | "device",
  clean: boolean,
  signal: AbortSignal | undefined,
  opts?: ExecuteBuildOptions,
): Promise<AgentToolResult<BuildDetails>> {
  const sdkPath = resolveSDKPath(config);
  const start = Date.now();
  const buildMode = opts?.buildMode ?? config.buildMode;

  const project = detectProject(projectPath);
  const pdc = findPdc(sdkPath);
  if (!pdc.ok) throw new Error(pdc.error ?? "pdc not found");

  if (clean) {
    killSimulator(state);
  }

  const allErrors: BuildResult["errors"] = [];
  const allWarnings: BuildResult["warnings"] = [];
  let buildOutput = "";

  if (project.kind === "c" || project.kind === "hybrid") {
    const cmake = await cmakeBuild(pi, projectPath, target, {
      sdkPath,
      buildMode,
      clean,
      signal,
    });
    buildOutput += cmake.output;
    allErrors.push(...cmake.errors);
    allWarnings.push(...cmake.warnings);

    if (!cmake.success) {
      const details: BuildDetails = {
        kind: project.kind,
        target,
        pdxPath: project.outputDir,
        durationMs: Date.now() - start,
        warnings: allWarnings,
        errors: allErrors,
        output: truncateTail(buildOutput).content,
      };
      state.lastBuildResult = details;
      const errorSummary =
        allErrors.length > 0
          ? allErrors
              .map(
                (e) => `${e.file ? `${e.file}:` : ""}${e.line}: ${e.message}`,
              )
              .join("; ")
          : truncateTail(buildOutput).content || "Unknown C build failure";
      throw new Error(`C build failed. ${errorSummary}`);
    }
  }

  if (project.kind === "lua" || project.kind === "hybrid") {
    const pdcResult = await withFileMutationQueue(
      project.outputDir,
      async () => {
        return runPdc(pi, pdc.path, project.sourceDir, project.outputDir, {
          cwd: projectPath,
          signal,
          strip: opts?.stripLua,
        });
      },
    );
    buildOutput += pdcResult.output;
    allErrors.push(...pdcResult.errors);
    allWarnings.push(...pdcResult.warnings);

    if (!pdcResult.success) {
      const details: BuildDetails = {
        kind: project.kind,
        target,
        pdxPath: project.outputDir,
        durationMs: Date.now() - start,
        warnings: allWarnings,
        errors: allErrors,
        output: truncateTail(buildOutput).content,
      };
      state.lastBuildResult = details;
      const errorSummary =
        allErrors.length > 0
          ? allErrors
              .map(
                (e) => `${e.file ? `${e.file}:` : ""}${e.line}: ${e.message}`,
              )
              .join("; ")
          : truncateTail(buildOutput).content || "Unknown pdc failure";
      throw new Error(`Build failed. ${errorSummary}`);
    }
  }

  const durationMs = Date.now() - start;
  const details: BuildDetails = {
    kind: project.kind,
    target,
    pdxPath: project.outputDir,
    durationMs,
    warnings: allWarnings,
    errors: allErrors,
  };
  state.lastBuildResult = details;

  const summary =
    allWarnings.length > 0
      ? `Built ${project.pdxName} (${durationMs}ms, ${allWarnings.length} warning(s))`
      : `Built ${project.pdxName} (${durationMs}ms)`;

  return {
    content: [{ type: "text", text: summary }],
    details,
  };
}

export function createBuildTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  return {
    name: "playdate_build",
    label: "Playdate Build",
    description:
      "Build a Playdate project (Lua or C). Auto-detects project kind.",
    promptSnippet: "Compile Playdate project to .pdx bundle",
    promptGuidelines: [
      "Use playdate_build before running in simulator or deploying to device.",
      "After playdate_build, check details.errors before proceeding.",
    ],
    parameters,

    async execute(
      _toolCallId: string,
      params: BuildParams,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<BuildDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<BuildDetails>> {
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
      );
    },

    renderCall(args: BuildParams, theme: Theme) {
      const optionArgs: Array<{ label: string; value: string }> = [];
      if (args.target) optionArgs.push({ label: "target", value: args.target });
      if (args.clean) optionArgs.push({ label: "clean", value: "true" });

      return new ToolCallHeader(
        {
          toolName: "Playdate Build",
          mainArg: args.projectPath || "",
          optionArgs,
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<BuildDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Build: compiling..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.kind) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Build failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const fields = [
        { label: "Kind", value: details.kind, showCollapsed: true },
        { label: "Target", value: details.target, showCollapsed: true },
        { label: "Output", value: details.pdxPath, showCollapsed: true },
      ];

      if (details.errors.length > 0) {
        fields.push({
          label: "Errors",
          value: details.errors
            .map((e) => `${e.file}:${e.line}: ${e.message}`)
            .join("\n"),
          showCollapsed: true,
        });
      }

      const footerItems = [{ label: "time", value: `${details.durationMs}ms` }];
      if (details.warnings.length > 0) {
        footerItems.push({
          label: "warnings",
          value: `${details.warnings.length}`,
        });
      }
      if (details.errors.length > 0) {
        footerItems.push({
          label: "errors",
          value: `${details.errors.length}`,
        });
      }

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

export function registerBuildTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
  state: RuntimeState,
) {
  pi.registerTool(createBuildTool(pi, config, state));
}
