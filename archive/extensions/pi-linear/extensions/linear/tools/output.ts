import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSize, truncateTail } from "@earendil-works/pi-coding-agent";

export async function prepareToolText(
  text: string,
  toolName: string,
): Promise<string> {
  const truncated = truncateTail(text);
  if (!truncated.truncated) return text;

  const dir = await mkdtemp(join(tmpdir(), `${toolName}-`));
  const fullOutputPath = join(dir, "output.txt");
  await writeFile(fullOutputPath, text, "utf8");

  const reason = truncated.truncatedBy ?? "limit";
  return [
    truncated.content,
    "",
    `[Output truncated by ${reason}. Showing ${truncated.outputLines}/${truncated.totalLines} lines, ${formatSize(truncated.outputBytes)}/${formatSize(truncated.totalBytes)}. Full output saved to ${fullOutputPath}.]`,
  ].join("\n");
}
