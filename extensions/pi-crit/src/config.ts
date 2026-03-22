import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import pkg from "../package.json" with { type: "json" };

/**
 * Raw config shape (what gets saved to disk).
 * All fields optional -- only overrides are stored.
 *
 * JSDoc comments on fields become `description` in the generated JSON Schema.
 * Run `pnpm gen:schema` after changing this interface.
 */
export interface CritConfig {
  /** Enable or disable the extension. */
  enabled?: boolean;
  /** Custom share service URL. Set to empty string to disable sharing. */
  shareUrl?: string;
  /** Default author name for comments. Supports {model} placeholder for dynamic model ID. */
  author?: string;
  /** Custom output directory for .crit.json files. */
  outputDir?: string;
  /** Inject tool guidance into the system prompt each turn. */
  systemPromptGuidance?: boolean;
}

/**
 * Resolved config (defaults merged in).
 * All fields required.
 */
export interface ResolvedCritConfig {
  enabled: boolean;
  shareUrl: string;
  author: string;
  outputDir: string;
  systemPromptGuidance: boolean;
}

const DEFAULTS: ResolvedCritConfig = {
  enabled: true,
  shareUrl: "",
  author: "Pi ({model})",
  outputDir: "",
  systemPromptGuidance: true,
};

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

export const configLoader = new ConfigLoader<CritConfig, ResolvedCritConfig>(
  "crit",
  DEFAULTS,
  { schemaUrl },
);
