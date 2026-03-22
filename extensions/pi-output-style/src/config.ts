import { ConfigLoader } from "@aliou/pi-utils-settings";

/**
 * Raw config shape (what gets saved to disk).
 * All fields optional -- only overrides are stored.
 */
export interface OutputStyleConfig {
  enabled?: boolean;
  activeStyle?: string;
}

/**
 * Resolved config (defaults merged in).
 * All fields required.
 */
export interface ResolvedOutputStyleConfig {
  enabled: boolean;
  activeStyle: string;
}

const DEFAULTS: ResolvedOutputStyleConfig = {
  enabled: true,
  activeStyle: "off",
};

/**
 * Config loader instance.
 * Config is stored at ~/.pi/agent/extensions/output-style.json
 */
export const configLoader = new ConfigLoader<
  OutputStyleConfig,
  ResolvedOutputStyleConfig
>("output-style", DEFAULTS);
