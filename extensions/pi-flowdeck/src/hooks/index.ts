import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerLicenseCheckHook } from "./license-check";
import { registerGuidance } from "./system-prompt";

export function registerHooks(pi: ExtensionAPI) {
  registerLicenseCheckHook(pi);
  registerGuidance(pi);
}
