import { ConfigLoader } from "@aliou/pi-utils-settings";

export interface PiXcodeConfig {
  enabled?: boolean;
}

export interface ResolvedPiXcodeConfig {
  enabled: boolean;
}

const DEFAULTS: ResolvedPiXcodeConfig = {
  enabled: true,
};

export const configLoader = new ConfigLoader<
  PiXcodeConfig,
  ResolvedPiXcodeConfig
>("xcode", DEFAULTS);
