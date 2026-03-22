import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import pkg from "../package.json" with { type: "json" };

export interface FlowdeckPiExtensionConfig {
  /** Enable or disable the extension. */
  enabled?: boolean;
  /** FlowDeck executable name (from PATH) or custom relative/absolute path. */
  flowdeckExecutable?: string;
  /** Default timeout in seconds for FlowDeck tools. */
  defaultTimeoutSeconds?: number;
  /** Inject FlowDeck usage guidance into the system prompt. */
  systemPromptGuidance?: boolean;
}

export interface ResolvedFlowdeckPiExtensionConfig {
  enabled: boolean;
  flowdeckExecutable: string;
  defaultTimeoutSeconds: number;
  systemPromptGuidance: boolean;
}

const DEFAULTS: ResolvedFlowdeckPiExtensionConfig = {
  enabled: true,
  flowdeckExecutable: "flowdeck",
  defaultTimeoutSeconds: 300,
  systemPromptGuidance: true,
};

const schemaUrl = buildSchemaUrl(pkg.name, pkg.version);

export const configLoader = new ConfigLoader<
  FlowdeckPiExtensionConfig,
  ResolvedFlowdeckPiExtensionConfig
>("flowdeck", DEFAULTS, { schemaUrl });
