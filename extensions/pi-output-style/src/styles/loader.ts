import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import matter from "gray-matter";
import { builtInStyles } from "./builtin";
import type { OutputStyle } from "./types";

/**
 * Load all output styles with proper override order:
 * 1. Built-in styles (lowest priority)
 * 2. Global styles: PI_CODING_AGENT_DIR/extensions/output-styles/*.md
 * 3. Local styles: <cwd>/.pi/extensions/output-styles/*.md (highest priority)
 *
 * Later styles override earlier ones by name (case-insensitive).
 */
export async function loadStyles(
  cwd: string,
): Promise<Map<string, OutputStyle>> {
  const styles = new Map<string, OutputStyle>();

  // 1. Built-in styles
  for (const [name, style] of builtInStyles) {
    styles.set(name, style);
  }

  // 2. Global styles
  const agentDir = getAgentDir();
  const globalDir = path.join(agentDir, "extensions", "output-styles");
  await loadStylesFromDir(styles, globalDir, "global");

  // 3. Local styles
  const localDir = path.join(cwd, ".pi", "extensions", "output-styles");
  await loadStylesFromDir(styles, localDir, "local");

  return styles;
}

/**
 * Load styles from a directory of .md files.
 */
async function loadStylesFromDir(
  styles: Map<string, OutputStyle>,
  dir: string,
  source: "global" | "local",
): Promise<void> {
  try {
    const files = await fs.promises.readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const filePath = path.join(dir, file);
      try {
        const content = await fs.promises.readFile(filePath, "utf-8");
        const style = parseStyleFile(file, content, source);
        if (style) {
          styles.set(style.name.toLowerCase(), style);
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }
}

/**
 * Parse a style markdown file with optional YAML frontmatter.
 *
 * Frontmatter fields:
 * - name: Display name (fallback to filename without .md)
 * - description: UI description
 *
 * The body of the file (after frontmatter) is the prompt.
 */
function parseStyleFile(
  filename: string,
  content: string,
  source: "global" | "local",
): OutputStyle | null {
  const parsed = matter(content);

  // Name fallback: frontmatter.name -> filename without .md
  let name = parsed.data.name as string | undefined;
  if (!name) {
    name = filename.replace(/\.md$/i, "");
  }

  return {
    name,
    description: parsed.data.description as string | undefined,
    prompt: parsed.content.trim(),
    source,
  };
}
