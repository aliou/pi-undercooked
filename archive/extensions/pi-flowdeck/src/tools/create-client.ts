import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ResolvedFlowDeckConfig } from "../config";
import { FlowDeckClient } from "../flowdeck/client";

/**
 * Create a FlowDeckClient from a Pi ExtensionAPI instance.
 * This centralizes the client creation so tool files stay thin.
 */
export function createClient(
  pi: ExtensionAPI,
  config: ResolvedFlowDeckConfig,
): FlowDeckClient {
  return new FlowDeckClient(
    (
      cmd: string,
      args: string[],
      opts?: { cwd?: string; timeout?: number; signal?: AbortSignal },
    ) => pi.exec(cmd, args, opts),
    { binaryPath: config.binaryPath },
  );
}
