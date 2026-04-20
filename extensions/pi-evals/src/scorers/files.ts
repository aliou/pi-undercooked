/**
 * Files scorer - checks that expected files exist with expected content
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Expected, ScoreContext, Scorer } from "../types";

/**
 * Creates a scorer that checks if expected files exist and contain expected content.
 * Uses substring matching for content comparison.
 */
export function files(): Scorer<Expected> {
  return {
    name: "files",
    score: async (ctx: ScoreContext<Expected>) => {
      const expectedFiles = ctx.expected?.files;

      if (!expectedFiles || Object.keys(expectedFiles).length === 0) {
        return {
          name: "files",
          score: 1,
          reason: "No files expected",
        };
      }

      const results: { file: string; ok: boolean; reason: string }[] = [];

      for (const [filePath, expectedContent] of Object.entries(expectedFiles)) {
        const fullPath = path.join(ctx.cwd, filePath);

        try {
          const content = await fs.readFile(fullPath, "utf-8");

          if (content.includes(expectedContent)) {
            results.push({
              file: filePath,
              ok: true,
              reason: "exists with expected content",
            });
          } else {
            results.push({
              file: filePath,
              ok: false,
              reason: `exists but missing expected content: "${truncate(expectedContent, 50)}"`,
            });
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            results.push({
              file: filePath,
              ok: false,
              reason: "file not found",
            });
          } else {
            results.push({
              file: filePath,
              ok: false,
              reason: `error reading: ${(err as Error).message}`,
            });
          }
        }
      }

      const passed = results.filter((r) => r.ok).length;
      const total = results.length;
      const score = total > 0 ? passed / total : 1;

      const reasons = results.map(
        (r) => `${r.ok ? "+" : "-"} ${r.file}: ${r.reason}`,
      );

      return {
        name: "files",
        score,
        reason: reasons.join("\n"),
      };
    },
  };
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 3)}...`;
}
