import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGroupedTool } from "./utils";

export function registerCompanyGtmTool(pi: ExtensionAPI) {
  registerGroupedTool(pi, "gtm", "linkup_company_gtm");
}
