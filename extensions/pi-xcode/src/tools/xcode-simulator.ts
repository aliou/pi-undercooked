import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { runCommand } from "../utils/exec";
import {
  ensureBooted,
  listSimulators,
  resolveSimulator,
  screenshot,
} from "../utils/simulator";

const schema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("status"),
      Type.Literal("boot"),
      Type.Literal("shutdown"),
      Type.Literal("erase"),
      Type.Literal("install"),
      Type.Literal("launch"),
      Type.Literal("terminate"),
      Type.Literal("uninstall"),
      Type.Literal("screenshot"),
    ],
    { description: "Simulator action to run" },
  ),
  simulatorName: Type.Optional(Type.String({ description: "Simulator name" })),
  appPath: Type.Optional(Type.String({ description: "Path to .app bundle" })),
  bundleId: Type.Optional(Type.String({ description: "Bundle identifier" })),
  args: Type.Optional(
    Type.Array(Type.String(), { description: "Launch args" }),
  ),
});

type Params = Static<typeof schema>;

export const xcodeSimulatorTool: ToolDefinition = {
  name: "xcode_simulator",
  label: "Xcode Simulator",
  description: "Manage iOS simulators and app lifecycle.",
  parameters: schema,
  async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
    const params = rawParams as Params;

    if (params.action === "list") {
      const devices = await listSimulators(signal);
      const lines = devices.map(
        (d) => `- ${d.name} (${d.runtime}) • ${d.state}`,
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { summary: `Found ${devices.length} simulator(s)` },
      };
    }

    if (!params.simulatorName)
      throw new Error("simulatorName is required for this action");

    if (params.action === "screenshot") {
      const shot = await screenshot(params.simulatorName, ctx.cwd, signal);
      return {
        content: [
          { type: "text", text: `Screenshot saved: ${shot.path}` },
          { type: "image", data: shot.base64, mimeType: "image/png" },
        ],
        details: {
          summary: `Screenshot captured on ${params.simulatorName}`,
          path: shot.path,
        },
      };
    }

    if (params.action === "status") {
      const device = await resolveSimulator(params.simulatorName, signal);
      return {
        content: [
          {
            type: "text",
            text: `${device.name} • ${device.runtime} • ${device.state}`,
          },
        ],
        details: { summary: `${device.name} is ${device.state}` },
      };
    }

    if (params.action === "boot") {
      const device = await ensureBooted(params.simulatorName, signal);
      return {
        content: [{ type: "text", text: `Booted ${device.name}.` }],
        details: { summary: `Simulator booted • ${device.name}` },
      };
    }

    const device = await resolveSimulator(params.simulatorName, signal);

    if (params.action === "shutdown") {
      const out = await runCommand(
        "xcrun",
        ["simctl", "shutdown", device.udid],
        { signal },
      );
      if (out.code !== 0)
        throw new Error(out.stderr || "Failed to shutdown simulator");
      return {
        content: [{ type: "text", text: `Shutdown ${device.name}.` }],
        details: { summary: "shutdown ok" },
      };
    }

    if (params.action === "erase") {
      const out = await runCommand("xcrun", ["simctl", "erase", device.udid], {
        signal,
      });
      if (out.code !== 0)
        throw new Error(out.stderr || "Failed to erase simulator");
      return {
        content: [{ type: "text", text: `Erased ${device.name}.` }],
        details: { summary: "erase ok" },
      };
    }

    await ensureBooted(params.simulatorName, signal);

    if (params.action === "install") {
      if (!params.appPath) throw new Error("appPath is required for install");
      const out = await runCommand(
        "xcrun",
        ["simctl", "install", "booted", params.appPath],
        {
          signal,
        },
      );
      if (out.code !== 0)
        throw new Error(out.stderr || "Failed to install app");
      return {
        content: [{ type: "text", text: `Installed app on ${device.name}.` }],
        details: { summary: "install ok" },
      };
    }

    if (!params.bundleId)
      throw new Error("bundleId is required for this action");

    if (params.action === "launch") {
      const out = await runCommand(
        "xcrun",
        ["simctl", "launch", "booted", params.bundleId, ...(params.args ?? [])],
        { signal },
      );
      if (out.code !== 0) throw new Error(out.stderr || "Failed to launch app");
      return {
        content: [
          {
            type: "text",
            text: `Launched ${params.bundleId} on ${device.name}.`,
          },
        ],
        details: { summary: "launch ok" },
      };
    }

    if (params.action === "terminate") {
      const out = await runCommand(
        "xcrun",
        ["simctl", "terminate", "booted", params.bundleId],
        {
          signal,
        },
      );
      if (out.code !== 0)
        throw new Error(out.stderr || "Failed to terminate app");
      return {
        content: [
          {
            type: "text",
            text: `Terminated ${params.bundleId} on ${device.name}.`,
          },
        ],
        details: { summary: "terminate ok" },
      };
    }

    const out = await runCommand(
      "xcrun",
      ["simctl", "uninstall", "booted", params.bundleId],
      {
        signal,
      },
    );
    if (out.code !== 0)
      throw new Error(out.stderr || "Failed to uninstall app");
    return {
      content: [
        {
          type: "text",
          text: `Uninstalled ${params.bundleId} from ${device.name}.`,
        },
      ],
      details: { summary: "uninstall ok" },
    };
  },
};
