import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { xcodeBuildTool } from "./xcode-build";
import { xcodeProjectTool } from "./xcode-project";
import { xcodeSimulatorTool } from "./xcode-simulator";
import { xcodeUiTool } from "./xcode-ui";

export function registerTools(pi: ExtensionAPI) {
  pi.registerTool(xcodeProjectTool);
  pi.registerTool(xcodeBuildTool);
  pi.registerTool(xcodeSimulatorTool);
  pi.registerTool(xcodeUiTool);
}
