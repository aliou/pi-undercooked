import { access } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { runShell } from "../utils/exec";
import { screenshot } from "../utils/simulator";

const schema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("describe_ui"),
      Type.Literal("tap"),
      Type.Literal("type"),
      Type.Literal("clear_text"),
      Type.Literal("swipe"),
      Type.Literal("scroll"),
      Type.Literal("wait_for"),
      Type.Literal("assert"),
      Type.Literal("query_controls"),
      Type.Literal("query_text"),
      Type.Literal("screenshot"),
      Type.Literal("chain_actions"),
    ],
    { description: "UI automation action" },
  ),
  simulatorName: Type.String({ description: "Simulator name" }),
  runnerCommand: Type.Optional(
    Type.String({
      description: "Harness command. Reads JSON from stdin and returns JSON.",
    }),
  ),
  projectPath: Type.Optional(
    Type.String({ description: "Path to .xcodeproj" }),
  ),
  workspacePath: Type.Optional(
    Type.String({ description: "Path to .xcworkspace" }),
  ),
  scheme: Type.Optional(Type.String({ description: "UITest scheme" })),
  params: Type.Optional(Type.Record(Type.String(), Type.Any())),
  steps: Type.Optional(
    Type.Array(Type.Any(), { description: "Steps for chain_actions" }),
  ),
  stopOnFailure: Type.Optional(
    Type.Boolean({ description: "Stop chain on first failure" }),
  ),
});

type Params = Static<typeof schema>;

function defaultRunnerCommand(cwd: string): string {
  return `bash ${path.join(cwd, "tools", "ui-automation-runner.sh")}`;
}

async function runnerExists(command: string): Promise<boolean> {
  const parts = command.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] === "bash") {
    const scriptPath = parts[1];
    if (!scriptPath) return false;

    try {
      await access(scriptPath);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

async function runHarness(
  runnerCommand: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const out = await runShell(runnerCommand, {
    input: `${JSON.stringify(payload)}\n`,
    signal,
  });

  if (out.code !== 0)
    throw new Error(out.stderr || "UI harness command failed");

  const raw = out.stdout.trim();
  if (!raw) throw new Error("UI harness returned empty response");

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      `UI harness returned non-JSON output: ${raw.slice(0, 300)}`,
    );
  }
}

export const xcodeUiTool: ToolDefinition = {
  name: "xcode_ui",
  label: "Xcode UI",
  description: "Drive iOS UI automation through a harness command.",
  parameters: schema,
  async execute(_toolCallId, rawParams, signal, onUpdate, ctx) {
    const params = rawParams as Params;

    if (params.action === "screenshot") {
      const shot = await screenshot(params.simulatorName, ctx.cwd, signal);
      return {
        content: [
          { type: "text", text: `Screenshot saved: ${shot.path}` },
          { type: "image", data: shot.base64, mimeType: "image/png" },
        ],
        details: {
          summary: `UI screenshot captured • ${params.simulatorName}`,
          path: shot.path,
        },
      };
    }

    const runnerCommand = params.runnerCommand ?? defaultRunnerCommand(ctx.cwd);
    if (!(await runnerExists(runnerCommand))) {
      throw new Error(
        "Missing runner. Pass runnerCommand or add tools/ui-automation-runner.sh",
      );
    }

    if (params.action !== "chain_actions") {
      onUpdate?.({
        content: [{ type: "text", text: `Running ${params.action}...` }],
        details: {},
      });

      const payload: Record<string, unknown> = {
        action: params.action,
        simulatorName: params.simulatorName,
        projectPath: params.projectPath,
        workspacePath: params.workspacePath,
        scheme: params.scheme,
        params: params.params ?? {},
      };

      const response = await runHarness(runnerCommand, payload, signal);
      if (response.ok === false) {
        throw new Error(
          (response.error as string) ?? `UI action failed: ${params.action}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text:
              (response.summary as string) ??
              `UI action succeeded: ${params.action}`,
          },
        ],
        details: {
          summary: (response.summary as string) ?? `${params.action} ok`,
          response,
        },
      };
    }

    const steps = Array.isArray(params.steps) ? params.steps : [];
    if (steps.length === 0)
      throw new Error("chain_actions requires non-empty steps");

    onUpdate?.({
      content: [{ type: "text", text: `Running chain 0/${steps.length}...` }],
      details: {},
    });

    const response = await runHarness(
      runnerCommand,
      {
        action: "chain_actions",
        simulatorName: params.simulatorName,
        projectPath: params.projectPath,
        workspacePath: params.workspacePath,
        scheme: params.scheme,
        stopOnFailure: params.stopOnFailure ?? true,
        steps,
      },
      signal,
    );

    const responseSteps = Array.isArray(response.steps)
      ? (response.steps as Array<Record<string, unknown>>)
      : [];
    const done = responseSteps.filter((s) => s.status === "passed").length;

    onUpdate?.({
      content: [
        { type: "text", text: `Chain progress ${done}/${steps.length}` },
      ],
      details: {},
    });

    if (response.ok === false) {
      const failedAt = (response.failedAt as number | undefined) ?? done + 1;
      throw new Error(
        (response.error as string) ??
          `Chain failed at step ${failedAt}/${steps.length}`,
      );
    }

    return {
      content: [
        {
          type: "text",
          text:
            (response.summary as string) ??
            `Chain succeeded • ${steps.length} step(s)`,
        },
      ],
      details: {
        summary:
          (response.summary as string) ??
          `Chain succeeded • ${steps.length} step(s)`,
        steps: responseSteps,
      },
    };
  },
};
