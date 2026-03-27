import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedNvimConfig } from "../config";
import {
  type NvimConnectionState,
  registerNvimContextHook,
} from "./nvim-context";

export type { NvimConnectionState } from "./nvim-context";

export function setupNvimHooks(
  pi: ExtensionAPI,
  state: NvimConnectionState,
  getConfig: () => ResolvedNvimConfig,
) {
  registerNvimContextHook(pi, state, getConfig);
}
