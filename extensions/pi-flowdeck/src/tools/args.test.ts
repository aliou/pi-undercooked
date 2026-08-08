import { describe, expect, it } from "vitest";
import {
  buildProjectArgs,
  buildSimulatorArgs,
  buildUiSimulatorArgs,
  FlowDeckArgumentError,
} from "./args";
import type {
  ProjectParamsType,
  SimulatorParamsType,
  UiSimulatorParamsType,
} from "./schema";

const sim = (p: Partial<SimulatorParamsType>) =>
  buildSimulatorArgs(p as SimulatorParamsType).join(" ");
const ui = (p: Partial<UiSimulatorParamsType>) =>
  buildUiSimulatorArgs(p as UiSimulatorParamsType).join(" ");
const project = (p: Partial<ProjectParamsType>) =>
  buildProjectArgs(p as ProjectParamsType).join(" ");

describe("buildSimulatorArgs", () => {
  it("maps device state actions to real subcommands", () => {
    expect(sim({ action: "appearance_set", appearance: "dark" })).toBe(
      "simulator appearance set dark",
    );
    expect(
      sim({ action: "content_size_set", contentSize: "extra-large" }),
    ).toBe("simulator content-size set extra-large");
    expect(sim({ action: "list_apps", simulator: "iPhone 16" })).toBe(
      "simulator list-apps -S iPhone 16",
    );
    expect(
      sim({ action: "app_container", bundleId: "com.x.y", container: "data" }),
    ).toBe("simulator app container com.x.y -c data");
  });

  it("uses --udid for location, which does not accept -S", () => {
    expect(
      sim({ action: "location_set", coordinates: "48.85,2.35", udid: "U" }),
    ).toBe("simulator location set 48.85,2.35 -u U");
  });

  it("records video under `simulator`, not `ui simulator`", () => {
    expect(
      sim({ action: "record", output: "/tmp/v.mp4", duration: "10s" }),
    ).toBe("simulator record --output-file /tmp/v.mp4 -t 10s");
  });

  it("requires the bundle id for privacy grant but not for reset", () => {
    expect(() =>
      sim({
        action: "privacy",
        privacyAction: "grant",
        privacyService: "photos",
      }),
    ).toThrow(FlowDeckArgumentError);
    expect(
      sim({ action: "privacy", privacyAction: "reset", privacyService: "all" }),
    ).toBe("simulator privacy reset all");
  });

  it("rejects actions missing a required positional argument", () => {
    expect(() => sim({ action: "boot" })).toThrow(/udid or name/);
    expect(() => sim({ action: "create", name: "X" })).toThrow(/deviceType/);
    expect(() => sim({ action: "launch" })).toThrow(/bundleId/);
    expect(() => sim({ action: "appearance_set" })).toThrow(/appearance/);
    expect(() => sim({ action: "push" })).toThrow(/payloadPath/);
  });

  it("still supports deleting unavailable simulators without a target", () => {
    expect(sim({ action: "delete", unavailable: true })).toBe(
      "simulator delete _ --unavailable",
    );
  });
});

describe("buildUiSimulatorArgs", () => {
  it("asks for a screenshot only when treeOnly is not set", () => {
    expect(ui({ action: "screen", simulator: "iPhone 16" })).toContain(
      "--screenshot",
    );
    expect(
      ui({ action: "screen", simulator: "iPhone 16", treeOnly: true }),
    ).not.toContain("--screenshot");
  });

  it("passes the token-saving screen flags", () => {
    expect(
      ui({ action: "screen", interactiveElements: true, sinceHash: "abc" }),
    ).toContain("--interactive-elements --since-hash abc");
  });

  it("builds batch and touch commands", () => {
    expect(ui({ action: "batch", steps: "[]" })).toBe(
      "ui simulator batch --steps [] --json",
    );
    expect(ui({ action: "touch_down", point: "10,20" })).toBe(
      "ui simulator touch down 10,20 --json",
    );
  });

  it("forwards intervalMs on session start", () => {
    expect(ui({ action: "session_start", intervalMs: 250 })).toContain(
      "--interval-ms 250",
    );
  });

  it("keeps speed 0, which is a valid scroll speed", () => {
    expect(ui({ action: "scroll", speed: 0 })).toContain("--speed 0");
  });

  it("rejects actions missing a required positional argument", () => {
    expect(() => ui({ action: "tap" })).toThrow(/target or point/);
    expect(() => ui({ action: "type" })).toThrow(/text/);
    expect(() => ui({ action: "assert", target: "X" })).toThrow(/assertion/);
    expect(() => ui({ action: "batch" })).toThrow(/steps or stepsFile/);
    expect(() => ui({ action: "touch_up" })).toThrow(/point/);
  });
});

describe("buildProjectArgs", () => {
  it("builds the package mutation commands", () => {
    expect(
      project({
        action: "packages_add",
        packages: {
          add: { url: "https://x/y", kind: "exact", value: "1.0.0" },
        },
      }),
    ).toBe("project packages add https://x/y -k exact -V 1.0.0");

    expect(
      project({
        action: "packages_unlink",
        packages: {
          unlink: { url: "https://x/y", target: "App", products: "A" },
        },
      }),
    ).toBe("project packages unlink https://x/y -t App --products A");

    expect(project({ action: "packages_targets" })).toBe(
      "project packages targets",
    );
  });
});
