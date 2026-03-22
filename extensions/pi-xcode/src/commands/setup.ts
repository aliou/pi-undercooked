import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { runCommand } from "../utils/exec";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function registerSetupCommand(pi: ExtensionAPI): void {
  pi.registerCommand("xcode:setup", {
    description: "Validate local Xcode/simulator/ui-harness setup",
    handler: async (_args, ctx) => {
      const checks: string[] = [];
      const issues: string[] = [];

      const xcode = await runCommand("xcode-select", ["-p"]).catch(
        () => undefined,
      );
      if (xcode && xcode.code === 0) {
        checks.push(`- Xcode CLI tools: OK (${xcode.stdout.trim()})`);
      } else {
        issues.push("- Xcode CLI tools missing. Run: xcode-select --install");
      }

      const simctl = await runCommand("xcrun", [
        "simctl",
        "list",
        "devices",
        "--json",
      ]).catch(() => undefined);
      if (simctl && simctl.code === 0) {
        checks.push("- simctl: OK");
      } else {
        issues.push(
          "- simctl unavailable. Open Xcode once and install iOS simulator runtimes.",
        );
      }

      const entries = await readdir(ctx.cwd).catch(() => []);
      const projectExists =
        (await exists(path.join(ctx.cwd, "project.yml"))) ||
        entries.some(
          (entry) =>
            entry.endsWith(".xcodeproj") || entry.endsWith(".xcworkspace"),
        );
      if (projectExists) {
        checks.push("- project hints: found");
      } else {
        issues.push(
          "- no obvious project hints found in cwd (project.yml / .xcodeproj).",
        );
      }

      const runnerPath = path.join(ctx.cwd, "tools", "ui-automation-runner.sh");
      if (await exists(runnerPath)) {
        checks.push(`- UI harness: found (${runnerPath})`);
      } else {
        issues.push("- UI harness missing at tools/ui-automation-runner.sh");
      }

      const lines = ["xcode:setup", "", "Checks", ...checks];
      if (issues.length > 0) {
        lines.push("", "Issues", ...issues);
      }

      const message = lines.join("\n");
      ctx.ui.notify(message, issues.length > 0 ? "warning" : "info");
    },
  });
}
