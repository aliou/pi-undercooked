import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGroupedTool } from "./utils";

export function registerCompanyProfileTool(pi: ExtensionAPI) {
  registerGroupedTool(pi, "profile", "linkup_company_profile");
}
