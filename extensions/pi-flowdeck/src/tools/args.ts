import type {
  BuildParamsType,
  ConfigParamsType,
  DeviceParamsType,
  ProjectParamsType,
  RunParamsType,
  SimulatorParamsType,
  TestParamsType,
  UiMacParamsType,
  UiSimulatorParamsType,
} from "./schema";

/**
 * Build CLI argument arrays from typed tool params.
 * These are Pi-free pure functions that map schema inputs to flowdeck CLI args.
 */

/**
 * Raised when an action is missing an argument the CLI requires positionally.
 *
 * Every schema field is optional because one schema covers many actions, so
 * these checks are what stop a half-built command reaching FlowDeck and
 * failing with an opaque usage error.
 */
export class FlowDeckArgumentError extends Error {
  constructor(action: string, requirement: string) {
    super(`flowdeck action "${action}" requires ${requirement}.`);
    this.name = "FlowDeckArgumentError";
  }
}

/** Assert a required string param is present, returning it narrowed. */
function required<T extends string>(
  value: T | undefined,
  action: string,
  requirement: string,
): T {
  if (value == null || value === "") {
    throw new FlowDeckArgumentError(action, requirement);
  }
  return value;
}

/** Assert at least one of several alternatives is present. */
function requireAny(
  values: Array<unknown>,
  action: string,
  requirement: string,
): void {
  if (values.every((value) => value == null || value === "")) {
    throw new FlowDeckArgumentError(action, requirement);
  }
}

// --- Build ---

export function buildBuildArgs(params: BuildParamsType): string[] {
  const args: string[] = [];

  if (params.action === "clean") {
    args.push("clean");
    if (params.cleanAll) args.push("--all");
    addCommonBuildArgs(args, params);
    return args;
  }

  args.push("build");
  addCommonBuildArgs(args, params);
  if (params.showWarnings) args.push("--show-warnings");
  return args;
}

// --- Run ---

export function buildRunArgs(params: RunParamsType): string[] {
  if (params.action !== "run") return buildAppLifecycleArgs(params);

  const args: string[] = ["run"];
  addCommonBuildArgs(args, params);

  if (params.log) args.push("--log");
  if (params.noBuild) args.push("--no-build");
  if (params.launchOptions) args.push("--launch-options", params.launchOptions);
  if (params.launchEnv) args.push("--launch-env", params.launchEnv);
  return args;
}

function buildAppLifecycleArgs(params: RunParamsType): string[] {
  switch (params.action) {
    case "apps": {
      const args = ["apps"];
      if (params.showAll) args.push("--all");
      if (params.prune) args.push("--prune");
      return args;
    }
    case "logs": {
      const args = ["logs"];
      if (params.identifier) args.push(params.identifier);
      return args;
    }
    case "stop": {
      const args = ["stop"];
      if (params.stopAll) args.push("--all");
      else if (params.identifier) args.push(params.identifier);
      if (params.force) args.push("--force");
      return args;
    }
    case "uninstall": {
      const args = ["uninstall"];
      if (params.identifier) args.push(params.identifier);
      if (params.targetSimulator)
        args.push("--simulator", params.targetSimulator);
      return args;
    }
    default:
      return [];
  }
}

// --- Test ---

export function buildTestArgs(params: TestParamsType): string[] {
  if (params.action === "discover") {
    const args = ["test", "discover"];
    addWorkspaceArgs(args, params);
    if (params.scheme) args.push("-s", params.scheme);
    if (params.filter) args.push("--filter", params.filter);
    if (params.includeSkipped) args.push("--include-skipped-tests");
    return args;
  }

  if (params.action === "plans") {
    const args = ["test", "plans"];
    addWorkspaceArgs(args, params);
    if (params.scheme) args.push("-s", params.scheme);
    return args;
  }

  const args = ["test"];
  addCommonBuildArgs(args, params);
  if (params.only) args.push("--only", params.only);
  if (params.skip) args.push("--skip", params.skip);
  if (params.plan) args.push("--plan", params.plan);
  if (params.testTargets) args.push("--test-targets", params.testTargets);
  if (params.progress) args.push("--progress");
  if (params.xcodebuildOptions)
    args.push("--xcodebuild-options", params.xcodebuildOptions);
  return args;
}

// --- Config ---

export function buildConfigArgs(params: ConfigParamsType): string[] {
  switch (params.action) {
    case "get": {
      const args = ["config", "get"];
      if (params.projectDir) args.push("-p", params.projectDir);
      return args;
    }
    case "set": {
      const args = ["config", "set"];
      if (params.workspace) args.push("-w", params.workspace);
      if (params.scheme) args.push("-s", params.scheme);
      if (params.simulator) args.push("-S", params.simulator);
      if (params.device) args.push("-D", params.device);
      if (params.configuration) args.push("-C", params.configuration);
      if (params.force) args.push("--force");
      if (params.projectDir) args.push("-p", params.projectDir);
      return args;
    }
    case "reset": {
      const args = ["config", "reset"];
      if (params.projectDir) args.push("-p", params.projectDir);
      return args;
    }
    default:
      return ["config"];
  }
}

// --- Project ---

export function buildProjectArgs(params: ProjectParamsType): string[] {
  switch (params.action) {
    case "context": {
      const args = ["context"];
      if (params.projectDir) args.push("-p", params.projectDir);
      return args;
    }
    case "schemes": {
      const args = ["project", "schemes"];
      if (params.workspace) args.push("-w", params.workspace);
      return args;
    }
    case "configs": {
      const args = ["project", "configs"];
      if (params.workspace) args.push("-w", params.workspace);
      return args;
    }
    case "packages_add": {
      const args = ["project", "packages", "add"];
      const add = params.packages?.add;
      if (add) {
        args.push(add.url);
        if (add.kind) args.push("-k", add.kind);
        if (add.value) args.push("-V", add.value);
      }
      if (params.workspace) args.push("-w", params.workspace);
      if (params.projectDir) args.push("-p", params.projectDir);
      if (params.dryRun) args.push("--dry-run");
      return args;
    }
    case "packages_remove": {
      const args = ["project", "packages", "remove"];
      if (params.packages?.remove) args.push(params.packages.remove.url);
      if (params.workspace) args.push("-w", params.workspace);
      if (params.projectDir) args.push("-p", params.projectDir);
      if (params.dryRun) args.push("--dry-run");
      return args;
    }
    case "packages_link":
    case "packages_unlink": {
      const verb = params.action === "packages_link" ? "link" : "unlink";
      const args = ["project", "packages", verb];
      const spec =
        params.action === "packages_link"
          ? params.packages?.link
          : params.packages?.unlink;
      if (spec) {
        args.push(spec.url, "-t", spec.target, "--products", spec.products);
      }
      if (params.workspace) args.push("-w", params.workspace);
      if (params.projectDir) args.push("-p", params.projectDir);
      if (params.dryRun) args.push("--dry-run");
      return args;
    }
    case "packages_targets": {
      const args = ["project", "packages", "targets"];
      if (params.workspace) args.push("-w", params.workspace);
      if (params.projectDir) args.push("-p", params.projectDir);
      return args;
    }
    case "packages_resolve": {
      const args = ["project", "packages", "resolve"];
      if (params.workspace) args.push("-w", params.workspace);
      if (params.scheme) args.push("-s", params.scheme);
      return args;
    }
    case "packages_update": {
      const args = ["project", "packages", "update"];
      if (params.workspace) args.push("-w", params.workspace);
      if (params.scheme) args.push("-s", params.scheme);
      return args;
    }
    case "packages_clear": {
      const args = ["project", "packages", "clear"];
      if (params.workspace) args.push("-w", params.workspace);
      return args;
    }
    case "packages_list": {
      const args = ["project", "packages", "list"];
      if (params.workspace) args.push("-w", params.workspace);
      return args;
    }
    case "sync_profiles": {
      const args = ["project", "sync-profiles"];
      if (params.workspace) args.push("-w", params.workspace);
      if (params.scheme) args.push("-s", params.scheme);
      return args;
    }
    case "create": {
      const args = ["project", "create"];
      if (params.create) {
        args.push(params.create.name);
        if (params.create.bundleId)
          args.push("--bundle-id", params.create.bundleId);
        if (params.create.platforms)
          args.push("--platforms", params.create.platforms);
        if (params.create.path) args.push("--path", params.create.path);
      }
      return args;
    }
    default:
      return [];
  }
}

// --- Simulator ---

export function buildSimulatorArgs(params: SimulatorParamsType): string[] {
  switch (params.action) {
    case "list": {
      const args = ["simulator", "list"];
      if (params.platform) args.push("--platform", params.platform);
      if (params.availableOnly) args.push("--available-only");
      return args;
    }
    case "boot": {
      requireAny([params.udid, params.name], "boot", "udid or name");
      return ["simulator", "boot", (params.udid ?? params.name) as string];
    }
    case "shutdown": {
      requireAny([params.udid, params.name], "shutdown", "udid or name");
      return ["simulator", "shutdown", (params.udid ?? params.name) as string];
    }
    case "create": {
      const args = ["simulator", "create"];
      args.push("-n", required(params.name, "create", "name"));
      args.push(
        "--device-type",
        required(params.deviceType, "create", "deviceType"),
      );
      args.push("--runtime", required(params.runtime, "create", "runtime"));
      return args;
    }
    case "delete": {
      if (params.unavailable)
        return ["simulator", "delete", "_", "--unavailable"];
      requireAny(
        [params.udid, params.name],
        "delete",
        "udid, name, or unavailable=true",
      );
      return ["simulator", "delete", (params.udid ?? params.name) as string];
    }
    case "erase": {
      requireAny([params.udid, params.name], "erase", "udid or name");
      return ["simulator", "erase", (params.udid ?? params.name) as string];
    }
    case "clone": {
      const args = ["simulator", "clone"];
      args.push(required(params.source, "clone", "source"));
      args.push("-n", required(params.name, "clone", "name"));
      return args;
    }
    case "runtime_list": {
      return ["simulator", "runtime", "list"];
    }
    case "runtime_available": {
      const args = ["simulator", "runtime", "available"];
      if (params.platform) args.push("--platform", params.platform);
      return args;
    }
    case "runtime_install": {
      const args = ["simulator", "runtime", "install"];
      args.push(required(params.platform, "runtime_install", "platform"));
      if (params.version) args.push(params.version);
      if (params.runtimePrune) args.push("--prune");
      return args;
    }
    case "runtime_delete": {
      const args = ["simulator", "runtime", "delete"];
      args.push(required(params.runtime, "runtime_delete", "runtime"));
      return args;
    }
    case "prune": {
      const args = ["simulator", "prune"];
      if (params.dryRun) args.push("--dry-run");
      return args;
    }
    case "launch": {
      const args = ["simulator", "launch"];
      args.push(required(params.bundleId, "launch", "bundleId"));
      return withSimulator(args, params);
    }
    case "list_apps":
      return withSimulator(["simulator", "list-apps"], params);
    case "app_container": {
      const args = ["simulator", "app", "container"];
      args.push(required(params.bundleId, "app_container", "bundleId"));
      if (params.container) args.push("-c", params.container);
      return withSimulator(args, params);
    }
    case "app_info": {
      const args = ["simulator", "app", "info"];
      args.push(required(params.bundleId, "app_info", "bundleId"));
      return withSimulator(args, params);
    }
    case "record": {
      const args = ["simulator", "record"];
      if (params.output) args.push("--output-file", params.output);
      if (params.duration) args.push("-t", params.duration);
      if (params.codec) args.push("--codec", params.codec);
      return withSimulator(args, params);
    }
    case "appearance_get":
      return withSimulator(["simulator", "appearance", "get"], params);
    case "appearance_set": {
      const args = ["simulator", "appearance", "set"];
      args.push(required(params.appearance, "appearance_set", "appearance"));
      return withSimulator(args, params);
    }
    case "appearance_reset":
      return withSimulator(["simulator", "appearance", "reset"], params);
    case "orientation_get":
      return withSimulator(["simulator", "orientation", "get"], params);
    case "orientation_set": {
      const args = ["simulator", "orientation", "set"];
      args.push(required(params.orientation, "orientation_set", "orientation"));
      return withSimulator(args, params);
    }
    case "content_size_get":
      return withSimulator(["simulator", "content-size", "get"], params);
    case "content_size_set": {
      const args = ["simulator", "content-size", "set"];
      args.push(
        required(params.contentSize, "content_size_set", "contentSize"),
      );
      return withSimulator(args, params);
    }
    case "content_size_reset":
      return withSimulator(["simulator", "content-size", "reset"], params);
    case "language_get":
      return withSimulator(["simulator", "language", "get"], params);
    case "language_set": {
      const args = ["simulator", "language", "set"];
      args.push(required(params.language, "language_set", "language"));
      if (params.locale) args.push("-l", params.locale);
      return withSimulator(args, params);
    }
    case "language_reset":
      return withSimulator(["simulator", "language", "reset"], params);
    case "status_bar_list":
      return withSimulator(["simulator", "status-bar", "list"], params);
    case "status_bar_clear":
      return withSimulator(["simulator", "status-bar", "clear"], params);
    case "status_bar_override": {
      const args = ["simulator", "status-bar", "override"];
      const bar = params.statusBar;
      if (bar) {
        if (bar.time) args.push("--time", bar.time);
        if (bar.dataNetwork) args.push("--data-network", bar.dataNetwork);
        if (bar.wifiMode) args.push("--wifi-mode", bar.wifiMode);
        if (bar.wifiBars != null)
          args.push("--wifi-bars", String(bar.wifiBars));
        if (bar.cellularMode) args.push("--cellular-mode", bar.cellularMode);
        if (bar.cellularBars != null)
          args.push("--cellular-bars", String(bar.cellularBars));
        if (bar.operatorName != null)
          args.push("--operator-name", bar.operatorName);
        if (bar.batteryState) args.push("--battery-state", bar.batteryState);
        if (bar.batteryLevel != null)
          args.push("--battery-level", String(bar.batteryLevel));
      }
      return withSimulator(args, params);
    }
    case "location_set": {
      // `location` takes --udid, not the shared -S/--simulator flag.
      const args = ["simulator", "location", "set"];
      args.push(
        required(
          params.coordinates,
          "location_set",
          "coordinates as 'lat,lon'",
        ),
      );
      const udid = params.udid ?? params.simulator;
      if (udid) args.push("-u", udid);
      if (params.dryRun) args.push("--dry-run");
      return args;
    }
    case "location_clear": {
      const args = ["simulator", "location", "clear"];
      const udid = params.udid ?? params.simulator;
      if (udid) args.push("-u", udid);
      return args;
    }
    case "pasteboard_get":
      return withSimulator(["simulator", "pasteboard", "get"], params);
    case "pasteboard_set": {
      const args = ["simulator", "pasteboard", "set"];
      args.push(required(params.text, "pasteboard_set", "text"));
      return withSimulator(args, params);
    }
    case "pasteboard_clear":
      return withSimulator(["simulator", "pasteboard", "clear"], params);
    case "privacy": {
      const args = ["simulator", "privacy"];
      const privacyAction = required(
        params.privacyAction,
        "privacy",
        "privacyAction",
      );
      args.push(privacyAction);
      args.push(required(params.privacyService, "privacy", "privacyService"));
      if (privacyAction !== "reset") {
        args.push(
          "-b",
          required(params.bundleId, "privacy", "bundleId for grant/revoke"),
        );
      } else if (params.bundleId) {
        args.push("-b", params.bundleId);
      }
      return withSimulator(args, params);
    }
    case "push": {
      const args = ["simulator", "push"];
      args.push(required(params.payloadPath, "push", "payloadPath"));
      if (params.bundleId) args.push("-b", params.bundleId);
      return withSimulator(args, params);
    }
    default:
      return [];
  }
}

/** Append the shared `-S/--simulator` selector used by most simulator subcommands. */
function withSimulator(args: string[], params: SimulatorParamsType): string[] {
  const target = params.simulator ?? params.udid ?? params.name;
  if (target) args.push("-S", target);
  return args;
}

// --- Device ---

export function buildDeviceArgs(params: DeviceParamsType): string[] {
  switch (params.action) {
    case "list": {
      const args = ["device", "list"];
      if (params.platform) args.push("--platform", params.platform);
      if (params.availableOnly) args.push("--available-only");
      return args;
    }
    case "install": {
      const args = ["device", "install"];
      if (params.udid) args.push(params.udid);
      if (params.appPath) args.push(params.appPath);
      return args;
    }
    case "uninstall": {
      const args = ["device", "uninstall"];
      if (params.udid) args.push(params.udid);
      if (params.bundleId) args.push(params.bundleId);
      return args;
    }
    case "launch": {
      const args = ["device", "launch"];
      if (params.udid) args.push(params.udid);
      if (params.bundleId) args.push(params.bundleId);
      return args;
    }
    default:
      return [];
  }
}

// --- UI Simulator ---

export function buildUiSimulatorArgs(params: UiSimulatorParamsType): string[] {
  const sim = params.simulator ? ["-S", params.simulator] : [];
  let args: string[];

  switch (params.action) {
    case "session_start":
      args = ["ui", "simulator", "session", "start", ...sim];
      if (params.intervalMs != null)
        args.push("--interval-ms", String(params.intervalMs));
      break;
    case "session_stop":
      args = ["ui", "simulator", "session", "stop", ...sim];
      break;
    case "tap": {
      requireAny([params.target, params.point], "tap", "target or point");
      args = ["ui", "simulator", "tap"];
      if (params.target) args.push(params.target);
      args.push(...sim);
      if (params.byId) args.push("--by-id");
      if (params.point) args.push("--point", params.point);
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "double_tap": {
      requireAny(
        [params.target, params.point],
        "double_tap",
        "target or point",
      );
      args = ["ui", "simulator", "double-tap"];
      if (params.target) args.push(params.target);
      args.push(...sim);
      if (params.byId) args.push("--by-id");
      if (params.point) args.push("--point", params.point);
      break;
    }
    case "type": {
      args = ["ui", "simulator", "type"];
      args.push(required(params.text, "type", "text"));
      args.push(...sim);
      if (params.clear) args.push("--clear");
      if (params.mask) args.push("--mask");
      break;
    }
    case "swipe": {
      args = ["ui", "simulator", "swipe"];
      args.push(required(params.direction, "swipe", "direction"));
      args.push(...sim);
      if (params.distance) args.push("--distance", params.distance);
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "scroll": {
      args = ["ui", "simulator", "scroll"];
      args.push(...sim);
      if (params.scrollDirection)
        args.push("--direction", params.scrollDirection);
      if (params.speed != null) args.push("--speed", String(params.speed));
      if (params.distance) args.push("--distance", params.distance);
      if (params.until) args.push("--until", params.until);
      if (params.timeout) args.push("--timeout", String(params.timeout * 1000));
      if (params.smooth) args.push("--smooth");
      break;
    }
    case "find": {
      args = ["ui", "simulator", "find"];
      args.push(required(params.target, "find", "target"));
      args.push(...sim);
      if (params.byId) args.push("--by-id");
      if (params.byRole) args.push("--by-role");
      if (params.contains) args.push("--contains");
      break;
    }
    case "wait": {
      args = ["ui", "simulator", "wait"];
      args.push(required(params.target, "wait", "target"));
      args.push(...sim);
      if (params.timeout) args.push("--timeout", String(params.timeout));
      if (params.condition === "gone") args.push("--gone");
      if (params.condition === "enabled") args.push("--enabled");
      if (params.condition === "stable") args.push("--stable");
      if (params.byId) args.push("--by-id");
      break;
    }
    case "assert": {
      args = ["ui", "simulator", "assert"];
      args.push(required(params.assertion, "assert", "assertion"));
      args.push(required(params.target, "assert", "target"));
      args.push(...sim);
      if (params.byId) args.push("--by-id");
      if (params.expected) args.push("--expected", params.expected);
      if (params.contains) args.push("--contains");
      break;
    }
    case "screen": {
      // FlowDeck 1.25 returns the accessibility tree by default; `--tree` is
      // deprecated and an image requires an explicit `--screenshot`.
      args = ["ui", "simulator", "screen"];
      args.push(...sim);
      if (params.output) args.push("--output", params.output);
      if (params.optimize) args.push("--optimize");
      if (!params.treeOnly) args.push("--screenshot");
      if (params.interactiveElements) args.push("--interactive-elements");
      if (params.sinceHash) args.push("--since-hash", params.sinceHash);
      break;
    }
    case "batch": {
      requireAny(
        [params.steps, params.stepsFile],
        "batch",
        "steps or stepsFile",
      );
      args = ["ui", "simulator", "batch"];
      if (params.steps) args.push("--steps", params.steps);
      if (params.stepsFile) args.push("-f", params.stepsFile);
      args.push(...sim);
      if (params.interactiveElements) args.push("--interactive-elements");
      break;
    }
    case "touch_down":
    case "touch_up": {
      args = [
        "ui",
        "simulator",
        "touch",
        params.action === "touch_down" ? "down" : "up",
      ];
      args.push(required(params.point, params.action, "point as 'x,y'"));
      args.push(...sim);
      break;
    }
    case "back":
      args = ["ui", "simulator", "back", ...sim];
      break;
    case "pinch": {
      args = ["ui", "simulator", "pinch"];
      args.push(required(params.pinchDirection, "pinch", "pinchDirection"));
      args.push(...sim);
      if (params.scale) args.push("--scale", String(params.scale));
      if (params.point) args.push("--point", params.point);
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "erase": {
      args = ["ui", "simulator", "erase"];
      args.push(...sim);
      if (params.characters)
        args.push("--characters", String(params.characters));
      break;
    }
    case "hide_keyboard":
      args = ["ui", "simulator", "hide-keyboard", ...sim];
      break;
    case "key": {
      requireAny(
        [params.keycode, params.sequence],
        "key",
        "keycode or sequence",
      );
      args = ["ui", "simulator", "key"];
      if (params.keycode != null) args.push(String(params.keycode));
      args.push(...sim);
      if (params.sequence) args.push("--sequence", params.sequence);
      if (params.duration) args.push("--hold", String(params.duration));
      break;
    }
    case "open_url": {
      args = ["ui", "simulator", "open-url"];
      args.push(required(params.url, "open_url", "url"));
      args.push(...sim);
      break;
    }
    case "clear_state": {
      args = ["ui", "simulator", "clear-state"];
      args.push(required(params.bundleId, "clear_state", "bundleId"));
      args.push(...sim);
      break;
    }
    case "rotate": {
      args = ["ui", "simulator", "rotate"];
      if (params.angle != null) args.push(String(params.angle));
      args.push(...sim);
      if (params.point) args.push("--point", params.point);
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "set_appearance": {
      args = ["ui", "simulator", "set-appearance"];
      args.push(required(params.appearance, "set_appearance", "appearance"));
      args.push(...sim);
      break;
    }
    case "button": {
      args = ["ui", "simulator", "button"];
      args.push(required(params.hardwareButton, "button", "hardwareButton"));
      args.push(...sim);
      if (params.hold != null) args.push("--hold", String(params.hold));
      break;
    }
    default:
      args = [];
  }

  // All UI actions support --json for structured output
  if (args.length > 0 && !args.includes("--json")) {
    args.push("--json");
  }
  return args;
}

export function buildUiMacArgs(params: UiMacParamsType): string[] {
  const app = params.app ? ["--app", params.app] : [];
  let args: string[];

  switch (params.action) {
    case "session_start":
      args = ["ui", "mac", "session", "start", ...app];
      break;
    case "session_stop":
      args = ["ui", "mac", "session", "stop"];
      break;
    case "screen": {
      args = ["ui", "mac", "screen", ...app];
      if (params.output) args.push("--output", params.output);
      if (params.treeOnly) args.push("--tree");
      break;
    }
    case "click": {
      args = ["ui", "mac", "click"];
      if (params.target) args.push(params.target);
      args.push(...app);
      if (params.byId) args.push("--by-id");
      if (params.point) args.push("--point", params.point);
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "double_click": {
      args = ["ui", "mac", "double-click"];
      if (params.target) args.push(params.target);
      args.push(...app);
      if (params.point) args.push("--point", params.point);
      break;
    }
    case "right_click": {
      args = ["ui", "mac", "right-click"];
      if (params.target) args.push(params.target);
      args.push(...app);
      if (params.point) args.push("--point", params.point);
      break;
    }
    case "type": {
      args = ["ui", "mac", "type"];
      if (params.text) args.push(params.text);
      args.push(...app);
      if (params.clear) args.push("--clear");
      if (params.mask) args.push("--mask");
      if (params.delayMs) args.push("--delay-ms", String(params.delayMs));
      break;
    }
    case "erase": {
      args = ["ui", "mac", "erase", ...app];
      if (params.characters)
        args.push("--characters", String(params.characters));
      break;
    }
    case "key": {
      args = ["ui", "mac", "key", ...app];
      if (params.keyName) args.push("--name", params.keyName);
      if (params.keycode) args.push("--keycode", String(params.keycode));
      break;
    }
    case "hotkey": {
      args = ["ui", "mac", "hotkey"];
      if (params.combo) args.push(params.combo);
      args.push(...app);
      break;
    }
    case "scroll": {
      args = ["ui", "mac", "scroll", ...app];
      if (params.direction) args.push("--direction", params.direction);
      if (params.amount) args.push("--amount", String(params.amount));
      if (params.smooth) args.push("--smooth");
      if (params.until) args.push("--until", params.until);
      if (params.scrollTimeout)
        args.push("--timeout", String(params.scrollTimeout));
      break;
    }
    case "move": {
      args = ["ui", "mac", "move"];
      if (params.point) args.push("--point", params.point);
      args.push(...app);
      break;
    }
    case "drag": {
      args = ["ui", "mac", "drag", ...app];
      if (params.from) args.push("--from", params.from);
      if (params.to) args.push("--to", params.to);
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "swipe": {
      args = ["ui", "mac", "swipe", ...app];
      if (params.direction) args.push("--direction", params.direction);
      if (params.distance) args.push("--distance", String(params.distance));
      if (params.duration) args.push("--duration", String(params.duration));
      break;
    }
    case "find": {
      args = ["ui", "mac", "find"];
      if (params.target) args.push(params.target);
      args.push(...app);
      if (params.byId) args.push("--by-id");
      if (params.byRole) args.push("--by-role");
      if (params.contains) args.push("--contains");
      break;
    }
    case "wait": {
      args = ["ui", "mac", "wait"];
      if (params.target) args.push(params.target);
      args.push(...app);
      if (params.condition) args.push("--condition", params.condition);
      if (params.timeout) args.push("--timeout", String(params.timeout));
      if (params.byId) args.push("--by-id");
      break;
    }
    case "assert": {
      args = ["ui", "mac", "assert"];
      if (params.assertion) args.push(params.assertion);
      if (params.target) args.push(params.target);
      args.push(...app);
      if (params.byId) args.push("--by-id");
      if (params.expected) args.push("--expected", params.expected);
      if (params.contains) args.push("--contains");
      break;
    }
    case "launch": {
      args = ["ui", "mac", "launch"];
      if (params.bundleId) args.push("--bundle-id", params.bundleId);
      break;
    }
    case "activate":
      args = ["ui", "mac", "activate", ...app];
      break;
    case "quit": {
      args = ["ui", "mac", "quit", ...app];
      if (params.force) args.push("--force");
      break;
    }
    case "window_list":
      args = ["ui", "mac", "window", "list", ...app];
      break;
    case "window_move": {
      args = ["ui", "mac", "window", "move", ...app];
      if (params.to) args.push("--to", params.to);
      if (params.index) args.push("--index", String(params.index));
      break;
    }
    case "window_resize": {
      args = ["ui", "mac", "window", "resize", ...app];
      if (params.size) args.push("--size", params.size);
      if (params.index) args.push("--index", String(params.index));
      break;
    }
    case "window_focus": {
      args = ["ui", "mac", "window", "focus", ...app];
      if (params.index) args.push("--index", String(params.index));
      break;
    }
    case "menu_list":
      args = ["ui", "mac", "menu", "list", ...app];
      break;
    case "menu_click": {
      args = ["ui", "mac", "menu", "click"];
      if (params.menuPath) args.push(params.menuPath);
      args.push(...app);
      break;
    }
    case "list_apps":
      args = ["ui", "mac", "list", "apps", ...app];
      break;
    case "list_windows":
      args = ["ui", "mac", "list", "windows", ...app];
      break;
    case "list_screens":
      args = ["ui", "mac", "list", "screens"];
      break;
    case "check_permissions":
      args = ["ui", "mac", "check-permissions"];
      break;
    case "request_permissions":
      args = ["ui", "mac", "request-permissions"];
      break;
    default:
      args = [];
  }

  // All UI actions support --json for structured output
  if (args.length > 0 && !args.includes("--json")) {
    args.push("--json");
  }
  return args;
}

// --- Shared helpers ---

interface WorkspaceParams {
  workspace?: string;
  projectDir?: string;
}

interface SchemeParams {
  scheme?: string;
}

interface DestinationParams {
  simulator?: string;
  device?: string;
}

interface BuildCommonParams
  extends WorkspaceParams,
    SchemeParams,
    DestinationParams {
  configuration?: string;
  derivedDataPath?: string;
  xcodebuildOptions?: string;
}

function addWorkspaceArgs(args: string[], params: WorkspaceParams): void {
  if (params.workspace) args.push("-w", params.workspace);
  if (params.projectDir) args.push("-p", params.projectDir);
}

function addCommonBuildArgs(args: string[], params: BuildCommonParams): void {
  addWorkspaceArgs(args, params);
  if (params.scheme) args.push("-s", params.scheme);
  if (params.simulator) args.push("-S", params.simulator);
  if (params.device) args.push("-D", params.device);
  if (params.configuration) args.push("-C", params.configuration);
  if (params.derivedDataPath) args.push("-d", params.derivedDataPath);
  if (params.xcodebuildOptions)
    args.push("--xcodebuild-options", params.xcodebuildOptions);
}
