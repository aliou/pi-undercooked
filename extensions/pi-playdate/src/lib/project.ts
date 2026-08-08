/**
 * Project detection: find project kind, pdxinfo, source/output dirs.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export type ProjectKind = "lua" | "c" | "hybrid";

export interface ProjectInfo {
  kind: ProjectKind;
  root: string;
  sourceDir: string;
  outputDir: string;
  pdxName: string;
  hasCMakeLists: boolean;
  hasPdxInfo: boolean;
}

/**
 * Detect project kind and resolve paths. Throws if no valid project found.
 */
export function detectProject(projectPath: string): ProjectInfo {
  const hasCMakeLists = existsSync(join(projectPath, "CMakeLists.txt"));
  const hasSourceDir =
    existsSync(join(projectPath, "Source")) ||
    existsSync(join(projectPath, "source"));
  const hasPdxInfoUpper = existsSync(join(projectPath, "Source", "pdxinfo"));
  const hasPdxInfoLower = existsSync(join(projectPath, "source", "pdxinfo"));
  const hasPdxInfo = hasPdxInfoUpper || hasPdxInfoLower;

  const sourceDir = existsSync(join(projectPath, "Source"))
    ? "Source"
    : "source";

  let kind: ProjectKind;
  if (hasCMakeLists && hasSourceDir) {
    kind = "hybrid";
  } else if (hasCMakeLists) {
    kind = "c";
  } else if (hasSourceDir) {
    kind = "lua";
  } else {
    throw new Error(
      `No Playdate project found at ${projectPath}. Expected CMakeLists.txt or Source/ directory.`,
    );
  }

  const dirName = basename(projectPath);
  const pdxName = `${dirName}.pdx`;
  const outputDir = join(projectPath, pdxName);

  return {
    kind,
    root: projectPath,
    sourceDir: join(projectPath, sourceDir),
    outputDir,
    pdxName,
    hasCMakeLists,
    hasPdxInfo,
  };
}

/**
 * Find a .pdx directory in the given path.
 */
export function findPdxBundle(projectPath: string): string | null {
  try {
    const entries = readdirSync(projectPath);
    for (const entry of entries) {
      if (entry.endsWith(".pdx")) {
        const full = join(projectPath, entry);
        if (statSync(full).isDirectory()) {
          return full;
        }
      }
    }
  } catch (_e) {
    return null;
  }
  return null;
}
