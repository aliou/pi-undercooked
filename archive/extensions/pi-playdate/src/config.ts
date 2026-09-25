import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import pkg from "../package.json" with { type: "json" };

/**
 * Raw config shape (what gets saved to disk).
 * All fields optional -- only overrides are stored.
 *
 * JSDoc comments on fields become `description` in the generated JSON Schema.
 * Run `pnpm gen:schema` after changing this interface.
 */
export interface PlaydateConfig {
  /** Override the PLAYDATE_SDK_PATH environment variable. */
  sdkPath?: string;
  /** Default build/run target. */
  defaultTarget?: "simulator" | "device";
  /** Build mode for C projects. */
  buildMode?: "debug" | "release";
  /** Path to arm-none-eabi toolchain (for C builds on Windows/Linux if not auto-detected). */
  armToolchainPath?: string;
  /** Automatically open the simulator after building. */
  autoOpenSimulator?: boolean;
  /** Number of simulator log lines to keep in the ring buffer. */
  simulatorLogLines?: number;
}

/**
 * Resolved config (defaults merged in).
 * All fields required.
 */
export interface ResolvedPlaydateConfig {
  sdkPath: string;
  defaultTarget: "simulator" | "device";
  buildMode: "debug" | "release";
  armToolchainPath: string;
  autoOpenSimulator: boolean;
  simulatorLogLines: number;
}

const DEFAULTS: ResolvedPlaydateConfig = {
  sdkPath: "",
  defaultTarget: "simulator",
  buildMode: "debug",
  armToolchainPath: "",
  autoOpenSimulator: true,
  simulatorLogLines: 200,
};

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

export const configLoader = new ConfigLoader<
  PlaydateConfig,
  ResolvedPlaydateConfig
>("playdate", DEFAULTS, { schemaUrl });
