import { ToolBody, ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { ResolvedPlaydateConfig } from "../config";
import { findDevice } from "../lib/device";
import {
  findArmToolchain,
  findPdc,
  findSimulator,
  readSdkVersion,
  resolveSDKPath,
} from "../lib/sdk";

interface DoctorDetails {
  sdk: { path: string; version: string; ok: boolean; error?: string };
  pdc: { path: string; ok: boolean; error?: string };
  simulator: { path: string; ok: boolean; error?: string };
  armToolchain: { path: string; ok: boolean; error?: string };
  device: { port: string | null; connected: boolean };
}

const parameters = Type.Object({});

export function createDoctorTool(config: ResolvedPlaydateConfig) {
  return {
    name: "playdate_doctor",
    label: "Playdate Doctor",
    description:
      "Check Playdate SDK installation and development environment. Verifies SDK, pdc, simulator, ARM toolchain, and connected device.",
    promptSnippet: "Check Playdate development environment health",
    parameters,

    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      _onUpdate: undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<DoctorDetails>> {
      const sdkPath = resolveSDKPath(config);
      const sdk = readSdkVersion(sdkPath);
      const pdc = findPdc(sdkPath);
      const simulator = findSimulator(sdkPath);
      const armToolchain = findArmToolchain(config, sdkPath);
      const device = findDevice();

      const details: DoctorDetails = {
        sdk,
        pdc,
        simulator,
        armToolchain,
        device,
      };

      const issues: string[] = [];
      if (!sdk.ok) issues.push(`SDK: ${sdk.error}`);
      if (!pdc.ok) issues.push(`pdc: ${pdc.error}`);
      if (!simulator.ok) issues.push(`Simulator: ${simulator.error}`);
      if (!armToolchain.ok) issues.push(`ARM toolchain: ${armToolchain.error}`);

      const summary =
        issues.length > 0
          ? `Issues found: ${issues.join("; ")}`
          : `SDK ${sdk.version} OK${device.connected ? ` · device: ${device.port}` : ""}`;

      return {
        content: [{ type: "text", text: summary }],
        details,
      };
    },

    renderCall(_args: Record<string, never>, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Playdate Doctor",
          mainArg: "",
          optionArgs: [],
          longArgs: [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<DoctorDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(
          theme.fg("muted", "Playdate Doctor: checking..."),
          0,
          0,
        );
      }

      const { details } = result;
      if (!details?.sdk) {
        const textBlock = result.content.find((c) => c.type === "text");
        const errorMsg =
          (textBlock?.type === "text" && textBlock.text) || "Check failed";
        return new Text(theme.fg("error", errorMsg), 0, 0);
      }

      const ok = (v: boolean) => (v ? "ok" : "missing");
      const fields = [
        {
          label: "SDK",
          value: details.sdk.ok
            ? `${details.sdk.version} (${details.sdk.path})`
            : (details.sdk.error ?? "not found"),
          showCollapsed: true,
        },
        { label: "pdc", value: ok(details.pdc.ok), showCollapsed: true },
        {
          label: "Simulator",
          value: ok(details.simulator.ok),
          showCollapsed: true,
        },
        {
          label: "ARM Toolchain",
          value: ok(details.armToolchain.ok),
          showCollapsed: false,
        },
        {
          label: "Device",
          value: details.device.connected
            ? (details.device.port ?? "connected")
            : "not connected",
          showCollapsed: true,
        },
      ];

      return new ToolBody({ fields }, options, theme);
    },
  };
}

export function registerDoctorTool(
  pi: ExtensionAPI,
  config: ResolvedPlaydateConfig,
) {
  pi.registerTool(createDoctorTool(config));
}
