import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGuidance } from "./system-prompt";

export function registerHooks(pi: ExtensionAPI) {
  registerGuidance(pi);
}
