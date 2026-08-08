import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../config";
import buildExtension from "./build";
import configExtension from "./config";
import deviceExtension from "./device";
import projectExtension from "./project";
import runExtension from "./run";
import sessionExtension from "./session";
import simulatorExtension from "./simulator";
import testExtension from "./test";
import uiMacExtension from "./ui-mac";
import uiSimulatorExtension from "./ui-simulator";

export default async function toolsExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  if (!config.enabled) return;

  await buildExtension(pi);
  await runExtension(pi);
  await testExtension(pi);
  await projectExtension(pi);
  await configExtension(pi);
  await simulatorExtension(pi);
  await deviceExtension(pi);
  await sessionExtension(pi);
  await uiSimulatorExtension(pi);
  await uiMacExtension(pi);
}
