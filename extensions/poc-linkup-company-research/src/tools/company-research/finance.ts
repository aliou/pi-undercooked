import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGroupedTool } from "./utils";

export function registerCompanyFinanceTool(pi: ExtensionAPI) {
  registerGroupedTool(pi, "finance", "linkup_company_finance");
}
