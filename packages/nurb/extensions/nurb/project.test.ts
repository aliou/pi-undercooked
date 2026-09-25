import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureParts, hasParts, renderTarget, requireParts } from "./project";

let dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-nurb-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe("requireParts", () => {
  it("throws when parts/ is missing", () => {
    const cwd = tmp();
    expect(() => requireParts(cwd)).toThrow(
      `No parts/ directory in ${cwd}. Create a part with nurb_new first.`,
    );
  });

  it("passes when parts/ exists", () => {
    const cwd = tmp();
    mkdirSync(join(cwd, "parts"));
    expect(() => requireParts(cwd)).not.toThrow();
  });
});

describe("ensureParts", () => {
  it("creates parts/ when absent", () => {
    const cwd = tmp();
    expect(hasParts(cwd)).toBe(false);
    ensureParts(cwd);
    expect(hasParts(cwd)).toBe(true);
  });

  it("is idempotent when parts/ exists", () => {
    const cwd = tmp();
    ensureParts(cwd);
    ensureParts(cwd);
    expect(hasParts(cwd)).toBe(true);
  });
});

describe("renderTarget", () => {
  it("points at build/renders/<part>.png", () => {
    expect(renderTarget("/p", "tray")).toBe("/p/build/renders/tray.png");
  });

  it("folds dashes to underscores like nurb does", () => {
    expect(renderTarget("/p", "lid-mount")).toBe(
      "/p/build/renders/lid_mount.png",
    );
  });

  it("points at the renders directory without a part", () => {
    expect(renderTarget("/p")).toBe("/p/build/renders");
  });
});
