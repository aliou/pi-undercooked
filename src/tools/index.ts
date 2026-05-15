import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerDocumentsTool } from "./documents/index";
import { registerIssueStartTool } from "./issue-start/index";
import { registerIssuesTool } from "./issues/index";
import { registerPeopleTool } from "./people/index";
import { registerProjectMilestonesTool } from "./project-milestones/index";
import { registerProjectsTool } from "./projects/index";
import { registerTeamsTool } from "./teams/index";
import { registerTeamStatesTool } from "./workflow-states/index";

export function registerTools(pi: ExtensionAPI): void {
  registerIssuesTool(pi);
  registerIssueStartTool(pi);
  registerProjectsTool(pi);
  registerProjectMilestonesTool(pi);
  registerTeamsTool(pi);
  registerPeopleTool(pi);
  registerDocumentsTool(pi);
  registerTeamStatesTool(pi);
}
