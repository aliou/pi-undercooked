/**
 * Eval file discovery
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import type { EvalDefinition, EvalOptions } from "./types";

// Global registry for evals (populated when eval files are imported)
const evalRegistry: EvalDefinition[] = [];

/**
 * Register an eval definition (called by evaluate())
 */
export function registerEval<TExpected>(
  name: string,
  options: EvalOptions<TExpected>,
  file: string,
): void {
  evalRegistry.push({
    name,
    // Cast to unknown first to avoid type overlap issues
    options: options as unknown as EvalOptions,
    file,
  });
}

/**
 * Clear the eval registry (for testing)
 */
export function clearRegistry(): void {
  evalRegistry.length = 0;
}

/**
 * Get all registered evals
 */
export function getRegisteredEvals(): EvalDefinition[] {
  return [...evalRegistry];
}

/**
 * Discover and load all eval files from a directory
 */
export async function discoverEvals(
  evalsDir: string,
): Promise<EvalDefinition[]> {
  const cwd = process.cwd();
  const fullDir = path.resolve(cwd, evalsDir);

  // Find all *.eval.ts and *.eval.js files
  const pattern = path.join(fullDir, "**/*.eval.{ts,js,mjs}");
  const files = await glob(pattern, { absolute: true });

  if (files.length === 0) {
    console.warn(`No eval files found in ${evalsDir}`);
    return [];
  }

  // Clear registry before loading
  clearRegistry();

  // Import each file (this triggers evaluate() calls which register evals)
  for (const file of files) {
    try {
      // Set current file context for registration
      setCurrentFile(file);
      const fileUrl = pathToFileURL(file).href;
      await import(fileUrl);
    } catch (err) {
      console.error(`Failed to load eval file ${file}:`, err);
    }
  }

  return getRegisteredEvals();
}

// Track current file being loaded (for registration)
let currentFile = "";

export function setCurrentFile(file: string): void {
  currentFile = file;
}

export function getCurrentFile(): string {
  return currentFile;
}
