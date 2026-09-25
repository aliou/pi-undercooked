import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCompanyResearchTools } from "./tools/company-research";

export default function (pi: ExtensionAPI) {
  const hasApiKey = !!process.env.LINKUP_API_KEY;

  if (!hasApiKey) {
    console.warn(
      "[linkup-company-research] LINKUP_API_KEY not set. Extension disabled.",
    );

    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        "LINKUP_API_KEY not set. linkup-company-research tools disabled.",
        "warning",
      );
    });
    return;
  }

  registerCompanyResearchTools(pi);
}
