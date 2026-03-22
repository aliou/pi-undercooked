import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGroupedTool } from "./utils";

export function registerCompanyPeopleTool(pi: ExtensionAPI) {
  registerGroupedTool(pi, "people", "linkup_company_people");
}
