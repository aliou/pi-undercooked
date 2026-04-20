/**
 * Config loading for pi-eval
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { GlobalConfig } from "./types";

const DEFAULT_CONFIG_FILES = [
  "pi-evals.config.ts",
  "pi-evals.config.js",
  "pi-evals.config.mjs",
];

const DEFAULT_CONFIG: Required<GlobalConfig> = {
  defaults: {},
  evalsDir: "./evals",
  delayBetweenTests: 500,
  timeout: 60_000,
  warnTestCount: 30,
};

/**
 * Helper for defining config with type inference
 */
export function defineConfig(config: GlobalConfig): GlobalConfig {
  return config;
}

/**
 * Load config from file or return defaults
 */
export async function loadConfig(
  configPath?: string,
): Promise<Required<GlobalConfig>> {
  const cwd = process.cwd();

  // If explicit path provided, use it
  if (configPath) {
    const fullPath = path.resolve(cwd, configPath);
    return loadConfigFile(fullPath);
  }

  // Try default config file names
  for (const filename of DEFAULT_CONFIG_FILES) {
    const fullPath = path.join(cwd, filename);
    try {
      await fs.access(fullPath);
      return loadConfigFile(fullPath);
    } catch {
      // File doesn't exist, try next
    }
  }

  // No config file found, return defaults
  return DEFAULT_CONFIG;
}

async function loadConfigFile(
  filePath: string,
): Promise<Required<GlobalConfig>> {
  try {
    // For TypeScript files, we need to compile or use a loader
    // For now, assume the file is pre-compiled or use tsx/ts-node
    const fileUrl = pathToFileURL(filePath).href;
    const module = (await import(fileUrl)) as { default?: GlobalConfig };

    const userConfig = module.default ?? {};

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      defaults: {
        ...DEFAULT_CONFIG.defaults,
        ...userConfig.defaults,
      },
    };
  } catch (err) {
    console.error(`Failed to load config from ${filePath}:`, err);
    return DEFAULT_CONFIG;
  }
}
