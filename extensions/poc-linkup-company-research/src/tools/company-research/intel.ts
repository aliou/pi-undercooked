import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGroupedTool } from "./utils";

export function registerCompanyIntelTool(pi: ExtensionAPI) {
  registerGroupedTool(pi, "intel", "linkup_company_intel");
}
