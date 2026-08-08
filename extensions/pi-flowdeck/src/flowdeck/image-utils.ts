/**
 * Read a file and return it as a base64-encoded string.
 * Used to embed screenshots in tool result content.
 */
import { readFile } from "node:fs/promises";

export async function readFileAsBase64(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}

/**
 * Read a screenshot file and return an ImageContent block for tool results.
 * Returns null if the file doesn't exist or can't be read.
 */
export async function readScreenshotAsImageContent(
  filePath: string,
): Promise<{ type: "image"; data: string; mimeType: string } | null> {
  try {
    const data = await readFileAsBase64(filePath);
    // FlowDeck screenshots are JPEG by default
    const mimeType = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
    return { type: "image" as const, data, mimeType };
  } catch {
    return null;
  }
}
