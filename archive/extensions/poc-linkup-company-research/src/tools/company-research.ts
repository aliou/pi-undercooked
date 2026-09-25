import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCompanyFinanceTool } from "./company-research/finance";
import { registerCompanyGtmTool } from "./company-research/gtm";
import { registerCompanyIntelTool } from "./company-research/intel";
import { registerCompanyMarketTool } from "./company-research/market";
import { registerCompanyPeopleTool } from "./company-research/people";
import { registerCompanyProfileTool } from "./company-research/profile";

export function registerCompanyResearchTools(pi: ExtensionAPI) {
  registerCompanyProfileTool(pi);
  registerCompanyPeopleTool(pi);
  registerCompanyFinanceTool(pi);
  registerCompanyGtmTool(pi);
  registerCompanyMarketTool(pi);
  registerCompanyIntelTool(pi);
}
