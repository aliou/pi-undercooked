import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAddRowsTool } from "./tools/add-rows";
import { registerCreateTool } from "./tools/create";
import { registerDescribeTool } from "./tools/describe";
import { registerReadTool } from "./tools/read";
import { registerWriteTool } from "./tools/write";

export default function (pi: ExtensionAPI) {
  registerDescribeTool(pi);
  registerReadTool(pi);
  registerWriteTool(pi);
  registerAddRowsTool(pi);
  registerCreateTool(pi);
}
