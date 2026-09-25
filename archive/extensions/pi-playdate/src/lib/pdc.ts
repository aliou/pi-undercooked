/**
 * Run pdc (Playdate compiler) and parse error output.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { DiagnosticEntry } from "./state";

export interface PdcResult {
  success: boolean;
  output: string;
  errors: DiagnosticEntry[];
  warnings: DiagnosticEntry[];
  exitCode: number;
}

/**
 * Run pdc to compile a Lua project to .pdx.
 */
export async function runPdc(
  pi: ExtensionAPI,
  pdcPath: string,
  sourceDir: string,
  outputDir: string,
  opts?: { signal?: AbortSignal; cwd?: string; strip?: boolean },
): Promise<PdcResult> {
  const args = opts?.strip
    ? ["-s", sourceDir, outputDir]
    : [sourceDir, outputDir];
  const result = await pi.exec(pdcPath, args, {
    cwd: opts?.cwd,
    signal: opts?.signal,
  });

  const combined = `${result.stdout}\n${result.stderr}`.trim();
  const errors = parsePdcDiagnostics(combined, "error");
  const warnings = parsePdcDiagnostics(combined, "warning");

  if (result.code !== 0 && errors.length === 0) {
    const fallback = extractFallbackMessage(combined);
    errors.push({
      file: sourceDir,
      line: 1,
      message: fallback ?? `pdc exited with code ${result.code}`,
    });
  }

  return {
    success: result.code === 0,
    output: combined,
    errors,
    warnings,
    exitCode: result.code,
  };
}

/**
 * Parse pdc output for diagnostics.
 * pdc errors look like: `filename.lua:LINE: error message`
 * or: `filename.lua:LINE:COL: error message`
 * Warnings may have "warning:" prefix.
 */
function parsePdcDiagnostics(
  output: string,
  kind: "error" | "warning",
): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Pattern: file:line: message or file:line:col: message
    const match = line.match(/^(.+?):(\d+)(?::(\d+))?:\s*(.+)$/);
    if (!match) {
      // Pattern: error: message or warning: message (no file)
      const prefixMatch = line.match(/^(warning|error):\s*(.+)$/i);
      if (prefixMatch) {
        const [, level, msg] = prefixMatch;
        if (level.toLowerCase() === kind) {
          entries.push({ file: "", line: 1, message: msg.trim() });
        }
      }
      continue;
    }

    const [, file, lineStr, colStr, message] = match;
    const isWarning = message.toLowerCase().startsWith("warning");
    const isError = !isWarning;

    if ((kind === "error" && isError) || (kind === "warning" && isWarning)) {
      entries.push({
        file,
        line: Number.parseInt(lineStr, 10),
        column: colStr ? Number.parseInt(colStr, 10) : undefined,
        message: message.replace(/^(warning|error):\s*/i, "").trim(),
      });
    }
  }

  return entries;
}

/**
 * Extract a meaningful error message from raw pdc output.
 * Prefers lines containing error keywords; falls back to the last non-empty line.
 */
function extractFallbackMessage(output: string): string | null {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  const keywords = /error|failed|cannot|could not/i;
  const keywordLine = lines.find((l) => keywords.test(l));
  if (keywordLine) return keywordLine;

  return lines[lines.length - 1];
}
