import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function partsDir(cwd: string): string {
  return join(cwd, "parts");
}

export function hasParts(cwd: string): boolean {
  return existsSync(partsDir(cwd));
}

// Mutating tools (nurb_new, nurb_serve) create parts/ when absent.
export function ensureParts(cwd: string): void {
  mkdirSync(partsDir(cwd), { recursive: true });
}

// Every other tool refuses to run outside a nurb project.
export function requireParts(cwd: string): void {
  if (hasParts(cwd)) return;
  throw new Error(
    `No parts/ directory in ${cwd}. Create a part with nurb_new first.`,
  );
}

// Where `nurb render` lands, absolute so the agent can read the PNG.
// nurb matches part names with dashes folded to underscores, so the file
// carries that same name.
export function renderTarget(cwd: string, part?: string): string {
  const dir = join(cwd, "build", "renders");
  if (!part) return dir;
  return join(dir, `${part.replaceAll("-", "_")}.png`);
}
