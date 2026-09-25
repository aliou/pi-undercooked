import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import pkg from "../package.json" with { type: "json" };

/**
 * Raw config shape (what gets saved to disk).
 * All fields optional -- only overrides are stored.
 */
export interface FlowDeckConfig {
  /** Enable or disable the extension. */
  enabled?: boolean;
  /** Path to the flowdeck binary. Defaults to "flowdeck" (resolved from PATH). */
  binaryPath?: string;
}

/**
 * Resolved config (defaults merged in).
 */
export interface ResolvedFlowDeckConfig {
  enabled: boolean;
  binaryPath: string;
}

const DEFAULTS: ResolvedFlowDeckConfig = {
  enabled: true,
  binaryPath: "flowdeck",
};

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

export const configLoader = new ConfigLoader<
  FlowDeckConfig,
  ResolvedFlowDeckConfig
>("flowdeck", DEFAULTS, { schemaUrl });
