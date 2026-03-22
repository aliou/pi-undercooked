import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckAppsTool } from "./apps";
import { registerFlowdeckBuildTool } from "./build";
import { registerFlowdeckCleanTool } from "./clean";
import { registerFlowdeckConfigTool } from "./config";
import { registerFlowdeckContextTool } from "./context";
import { registerDeviceTool } from "./device";
import { registerFlowdeckLogsTool } from "./logs";
import { registerFlowdeckProjectTool } from "./project";
import { registerFlowdeckToolRoot } from "./root";
import { registerFlowdeckRunTool } from "./run";
import { registerSimulatorTool } from "./simulator";
import { registerFlowdeckStopTool } from "./stop";
import { registerFlowdeckTestTool } from "./test";
import { registerUiTool } from "./ui";
import { registerFlowdeckUninstallTool } from "./uninstall";

export function registerTools(pi: ExtensionAPI) {
  registerFlowdeckToolRoot(pi);
  registerFlowdeckContextTool(pi);
  registerFlowdeckConfigTool(pi);
  registerFlowdeckBuildTool(pi);
  registerFlowdeckRunTool(pi);
  registerFlowdeckTestTool(pi);
  registerFlowdeckCleanTool(pi);
  registerFlowdeckAppsTool(pi);
  registerFlowdeckLogsTool(pi);
  registerFlowdeckStopTool(pi);
  registerFlowdeckUninstallTool(pi);
  registerFlowdeckProjectTool(pi);
  registerSimulatorTool(pi);
  registerUiTool(pi);
  registerDeviceTool(pi);
}
