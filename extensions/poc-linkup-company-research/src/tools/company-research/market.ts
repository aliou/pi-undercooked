import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGroupedTool } from "./utils";

export function registerCompanyMarketTool(pi: ExtensionAPI) {
  registerGroupedTool(pi, "market", "linkup_company_market");
}
