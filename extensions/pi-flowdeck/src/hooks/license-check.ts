import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";

interface LicenseStatus {
  success?: boolean;
  valid?: boolean;
  status?: string;
  plan?: string;
  [key: string]: unknown;
}

interface LicenseCheckResult {
  ok: boolean;
  missingBinary: boolean;
  status: LicenseStatus | null;
}

function parseStatus(output: string): LicenseStatus | null {
  const trimmed = output.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as LicenseStatus;
  } catch {
    return null;
  }
}

function isLicensed(status: LicenseStatus | null): boolean {
  if (!status) return false;

  const nestedStatus =
    typeof status.data === "object" && status.data
      ? (status.data as { status?: unknown }).status
      : undefined;

  if (status.valid === true) return true;
  if (status.success === true && status.status === "active") return true;
  if (status.status === "active") return true;
  if (nestedStatus === "active") return true;

  return false;
}

function isMissingBinaryError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("enoent") ||
    lowered.includes("not found") ||
    lowered.includes("no such file")
  );
}

async function checkWithExecutable(
  pi: ExtensionAPI,
  executable: string,
): Promise<LicenseCheckResult> {
  try {
    const result = await pi.exec(executable, ["license", "status", "--json"], {
      timeout: 10000,
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const status = parseStatus(result.stdout || result.stderr || "");

    const missingBinary = result.code !== 0 && isMissingBinaryError(output);
    return {
      ok: result.code === 0 && isLicensed(status),
      missingBinary,
      status,
    };
  } catch (error) {
    const message = String(error);
    return {
      ok: false,
      missingBinary: isMissingBinaryError(message),
      status: null,
    };
  }
}

function expandHome(path: string): string {
  if (!path.startsWith("~/")) return path;
  const home = process.env.HOME;
  if (!home) return path;
  return resolve(home, path.slice(2));
}

export function registerLicenseCheckHook(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const cfg = configLoader.getConfig();

    const configured = cfg.flowdeckExecutable.includes("/")
      ? resolve(ctx.cwd, expandHome(cfg.flowdeckExecutable))
      : cfg.flowdeckExecutable;

    const candidates = [
      configured,
      resolve(ctx.cwd, ".flowdeck-cli/flowdeck"),
      "flowdeck",
    ].filter((value, index, arr) => arr.indexOf(value) === index);

    let hasExecutableCandidate = false;
    let sawMissingBinary = false;

    for (const executable of candidates) {
      if (executable.includes("/") && !existsSync(executable)) continue;

      hasExecutableCandidate = true;
      const result = await checkWithExecutable(pi, executable);

      if (result.ok) {
        return;
      }

      if (result.missingBinary) sawMissingBinary = true;
    }

    if (!hasExecutableCandidate || sawMissingBinary) {
      ctx.ui.notify(
        "FlowDeck executable not found. Set flowdeckExecutable in flowdeck extension config.",
        "warning",
      );
      return;
    }

    ctx.ui.notify(
      "FlowDeck license not active. Run: flowdeck license status --json",
      "warning",
    );
  });
}
