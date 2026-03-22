import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { runCommand } from "../utils/exec";
import {
  buildLocationArgs,
  ensureBootedSimulator,
  extractXcodeErrors,
  getAppPath,
  getBundleIdFromApp,
  resolveXcodeLocation,
} from "../utils/xcode";

const schema = Type.Object({
  action: Type.String({
    description:
      "Build action. Allowed: build, build_install, build_run, clean, test. Aliases: run->build_run, install->build_install",
  }),
  projectPath: Type.Optional(
    Type.String({ description: "Path to .xcodeproj" }),
  ),
  workspacePath: Type.Optional(
    Type.String({ description: "Path to .xcworkspace" }),
  ),
  scheme: Type.String({ description: "Scheme name" }),
  configuration: Type.Optional(
    Type.Union([Type.Literal("Debug"), Type.Literal("Release")], {
      description: "Build configuration",
    }),
  ),
  simulatorName: Type.Optional(
    Type.String({
      description: "Simulator name (required for install/run/test)",
    }),
  ),
  bundleId: Type.Optional(Type.String({ description: "Bundle identifier" })),
  args: Type.Optional(
    Type.Array(Type.String(), { description: "Launch arguments" }),
  ),
});

type Params = Static<typeof schema>;

type BuildAction = "build" | "build_install" | "build_run" | "clean" | "test";

const ACTION_ALIASES: Record<string, BuildAction> = {
  run: "build_run",
  install: "build_install",
};

const VALID_ACTIONS: BuildAction[] = [
  "build",
  "build_install",
  "build_run",
  "clean",
  "test",
];

function normalizeAction(action: string): BuildAction {
  const normalized = (ACTION_ALIASES[action] ?? action) as BuildAction;
  if (VALID_ACTIONS.includes(normalized)) {
    return normalized;
  }

  throw new Error(
    `Invalid xcode_build action: ${action}. Allowed: ${VALID_ACTIONS.join(", ")}. Aliases: run, install.`,
  );
}

export const xcodeBuildTool: ToolDefinition = {
  name: "xcode_build",
  label: "Xcode Build",
  description: "Build, install, run, clean, or test an Xcode project.",
  promptSnippet: "Build, install, run, clean, or test an Xcode project.",
  promptGuidelines: [
    "Only use supported actions: build, build_install, build_run, clean, or test.",
    "Normalize aliases like run to build_run and install to build_install.",
    "Prefer inspecting the project and available schemes before building when project state is unclear.",
  ],
  parameters: schema,
  async execute(_toolCallId, rawParams, signal, onUpdate, ctx) {
    const params = rawParams as Params;
    const action = normalizeAction(params.action);

    const configuration = params.configuration ?? "Debug";
    const location = await resolveXcodeLocation(
      {
        projectPath: params.projectPath,
        workspacePath: params.workspacePath,
        scheme: params.scheme,
        configuration,
      },
      ctx.cwd,
      signal,
    );

    if (action === "clean") {
      onUpdate?.({
        content: [{ type: "text", text: "Cleaning build artifacts..." }],
        details: {},
      });
      const cleaned = await runCommand(
        "xcodebuild",
        [...buildLocationArgs(location), "clean"],
        {
          signal,
        },
      );
      if (cleaned.code !== 0)
        throw new Error(cleaned.stderr || "xcodebuild clean failed");
      return {
        content: [{ type: "text", text: "Clean succeeded." }],
        details: { summary: "clean ok" },
      };
    }

    const needsSimulator =
      action === "build_install" || action === "build_run" || action === "test";
    if (needsSimulator && !params.simulatorName) {
      throw new Error(
        "simulatorName is required for build_install, build_run, and test",
      );
    }

    let destinationArgs: string[] = [];
    if (params.simulatorName) {
      const simulator = await ensureBootedSimulator(
        params.simulatorName,
        signal,
      );
      destinationArgs = [
        "-destination",
        `platform=iOS Simulator,id=${simulator.udid}`,
      ];
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Using simulator ${simulator.name} (${simulator.runtime})`,
          },
        ],
        details: {},
      });
    }

    if (action === "test") {
      onUpdate?.({
        content: [{ type: "text", text: "Running tests..." }],
        details: {},
      });
      const tested = await runCommand(
        "xcodebuild",
        [...buildLocationArgs(location), ...destinationArgs, "test"],
        { signal },
      );

      if (tested.code !== 0) {
        const diagnostics = extractXcodeErrors(tested.stderr, tested.stdout);
        const diagText =
          diagnostics.length > 0 ? diagnostics.join("\n") : tested.stderr;
        throw new Error(diagText || "xcodebuild test failed");
      }

      return {
        content: [
          { type: "text", text: `Tests passed for scheme ${params.scheme}.` },
        ],
        details: { summary: `test ok ${params.scheme}` },
      };
    }

    onUpdate?.({
      content: [{ type: "text", text: "Building app..." }],
      details: {},
    });
    const built = await runCommand(
      "xcodebuild",
      [...buildLocationArgs(location), ...destinationArgs, "build"],
      { signal },
    );

    if (built.code !== 0) {
      const diagnostics = extractXcodeErrors(built.stderr, built.stdout);
      const diagText =
        diagnostics.length > 0 ? diagnostics.join("\n") : built.stderr;
      throw new Error(diagText || "xcodebuild failed");
    }

    if (action === "build") {
      return {
        content: [
          {
            type: "text",
            text: `Build succeeded for scheme ${params.scheme}.`,
          },
        ],
        details: { summary: `build ok ${params.scheme}` },
      };
    }

    const simulatorName = params.simulatorName;
    if (!simulatorName)
      throw new Error("simulatorName is required for install/run actions");

    const appPath = await getAppPath(location, simulatorName, signal);
    const bundleId =
      params.bundleId ?? (await getBundleIdFromApp(appPath, signal));
    if (!bundleId)
      throw new Error("Could not resolve bundle id. Pass bundleId explicitly.");

    onUpdate?.({
      content: [{ type: "text", text: "Reinstalling app..." }],
      details: {},
    });
    await runCommand("xcrun", ["simctl", "terminate", "booted", bundleId], {
      signal,
    }).catch(() => undefined);

    const installed = await runCommand(
      "xcrun",
      ["simctl", "install", "booted", appPath],
      {
        signal,
      },
    );
    if (installed.code !== 0)
      throw new Error(installed.stderr || "Failed to install app on simulator");

    onUpdate?.({
      content: [{ type: "text", text: "Launching app..." }],
      details: {},
    });
    const launched = await runCommand(
      "xcrun",
      ["simctl", "launch", "booted", bundleId, ...(params.args ?? [])],
      { signal },
    );
    if (launched.code !== 0)
      throw new Error(launched.stderr || "Failed to launch app");

    return {
      content: [
        {
          type: "text",
          text:
            action === "build_install"
              ? `Build/install/run succeeded for ${bundleId}.`
              : `Build/run succeeded for ${bundleId}.`,
        },
      ],
      details: { summary: `${action} ok`, bundleId },
    };
  },
};
