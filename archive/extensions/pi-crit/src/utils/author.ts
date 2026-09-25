import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";

/**
 * Resolve the author string, replacing {model} with the current model ID.
 */
export function resolveAuthor(ctx: ExtensionContext): string {
  const config = configLoader.getConfig();
  const modelId = ctx.model?.id ?? "unknown";
  return config.author.replace("{model}", modelId);
}
