import { describe, expect, it } from "vitest";
import {
  buildArgs,
  checkArgs,
  compareArgs,
  exportArgs,
  inspectArgs,
  newArgs,
  nurbError,
  renderArgs,
  scanArgs,
  verifyArgs,
} from "./nurb";

function result(code: number, stdout = "", stderr = "") {
  return { code, stdout, stderr, killed: false };
}

describe("arg builders", () => {
  it("nurb new", () => {
    expect(newArgs("tray")).toEqual(["new", "tray"]);
  });

  it("build with and without part", () => {
    expect(buildArgs()).toEqual(["build"]);
    expect(buildArgs("tray")).toEqual(["build", "tray"]);
  });

  it("check with strict", () => {
    expect(checkArgs("tray")).toEqual(["check", "tray"]);
    expect(checkArgs(undefined, true)).toEqual(["check", "--strict"]);
    expect(checkArgs("tray", true)).toEqual(["check", "tray", "--strict"]);
  });

  it("inspect with render", () => {
    expect(inspectArgs()).toEqual(["inspect"]);
    expect(inspectArgs("tray", true)).toEqual(["inspect", "tray", "--render"]);
  });

  it("export with formats", () => {
    expect(exportArgs("tray")).toEqual(["export", "tray"]);
    expect(exportArgs()).toEqual(["export"]);
    expect(exportArgs(undefined, [])).toEqual(["export"]);
    expect(exportArgs("tray", ["3mf", "stl"])).toEqual([
      "export",
      "tray",
      "--formats",
      "3mf",
      "stl",
    ]);
  });

  it("render with section", () => {
    expect(renderArgs("tray")).toEqual(["render", "tray"]);
    expect(renderArgs("tray", "z:0.7")).toEqual([
      "render",
      "tray",
      "--section",
      "z:0.7",
    ]);
  });

  it("scan with section", () => {
    expect(scanArgs("scans/mug.stl")).toEqual(["scan", "scans/mug.stl"]);
    expect(scanArgs("scans/mug.stl", "z:40mm")).toEqual([
      "scan",
      "scans/mug.stl",
      "--section",
      "z:40mm",
    ]);
  });

  it("compare with against", () => {
    expect(compareArgs("mug")).toEqual(["compare", "mug"]);
    expect(compareArgs("mug", "scans/mug.stl")).toEqual([
      "compare",
      "mug",
      "--against",
      "scans/mug.stl",
    ]);
  });

  it("verify with report", () => {
    expect(verifyArgs()).toEqual(["verify"]);
    expect(verifyArgs("tray", true)).toEqual(["verify", "tray", "--report"]);
  });
});

describe("nurbError", () => {
  it("uses trimmed stderr when present", () => {
    const error = nurbError("build", result(1, "", "  no part named x\n"));
    expect(error.message).toBe("no part named x");
  });

  it("falls back to trimmed stdout", () => {
    const error = nurbError("check", result(1, "  tray: 2 finding(s)\n", ""));
    expect(error.message).toBe("tray: 2 finding(s)");
  });

  it("falls back to the exit code", () => {
    const error = nurbError("export", result(2, "", ""));
    expect(error.message).toBe("nurb export exited with code 2");
  });
});
