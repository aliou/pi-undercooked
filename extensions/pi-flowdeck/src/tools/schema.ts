import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";

// --- Project tool actions ---

export const PROJECT_ACTIONS = [
  "context",
  "schemes",
  "configs",
  "packages_list",
  "packages_add",
  "packages_remove",
  "packages_link",
  "packages_unlink",
  "packages_targets",
  "packages_resolve",
  "packages_update",
  "packages_clear",
  "sync_profiles",
  "create",
] as const;

export const ProjectParams = Type.Object({
  action: StringEnum(PROJECT_ACTIONS, {
    description: "Project action to perform.",
  }),
  workspace: Type.Optional(
    Type.String({ description: "Path to .xcworkspace or .xcodeproj." }),
  ),
  scheme: Type.Optional(Type.String({ description: "Scheme name." })),
  projectDir: Type.Optional(Type.String({ description: "Project directory." })),
  packages: Type.Optional(
    Type.Object({
      add: Type.Optional(
        Type.Object({
          url: Type.String({ description: "Package URL" }),
          kind: Type.Optional(
            StringEnum(
              [
                "upToNextMajor",
                "upToNextMinor",
                "exact",
                "branch",
                "revision",
              ] as const,
              { description: "Version requirement kind" },
            ),
          ),
          value: Type.Optional(Type.String({ description: "Version value" })),
        }),
      ),
      remove: Type.Optional(
        Type.Object({
          url: Type.String({ description: "Package URL to remove" }),
        }),
      ),
      link: Type.Optional(
        Type.Object({
          url: Type.String({ description: "Package URL" }),
          target: Type.String({ description: "Target to link to" }),
          products: Type.String({
            description: "Comma-separated product names",
          }),
        }),
      ),
      unlink: Type.Optional(
        Type.Object({
          url: Type.String({ description: "Package URL" }),
          target: Type.String({ description: "Target to unlink from" }),
          products: Type.String({
            description: "Comma-separated product names",
          }),
        }),
      ),
    }),
  ),
  dryRun: Type.Optional(
    Type.Boolean({
      description:
        "Preview a packages add/remove/link/unlink change without modifying the project.",
    }),
  ),
  create: Type.Optional(
    Type.Object({
      name: Type.String({ description: "App name for new project" }),
      bundleId: Type.Optional(
        Type.String({ description: "Bundle identifier" }),
      ),
      platforms: Type.Optional(
        Type.String({ description: "Comma-separated: ios,macos,visionos" }),
      ),
      path: Type.Optional(Type.String({ description: "Output directory" })),
    }),
  ),
});

export type ProjectParamsType = Static<typeof ProjectParams>;

// --- Config tool actions ---

export const CONFIG_ACTIONS = ["get", "set", "reset"] as const;

export const ConfigParams = Type.Object({
  action: StringEnum(CONFIG_ACTIONS, {
    description: "Config action to perform.",
  }),
  workspace: Type.Optional(
    Type.String({
      description: "Path to .xcworkspace or .xcodeproj. Required for set.",
    }),
  ),
  scheme: Type.Optional(
    Type.String({ description: "Scheme name. Required for set." }),
  ),
  simulator: Type.Optional(
    Type.String({ description: 'Simulator name or UDID (e.g. "iPhone 16").' }),
  ),
  device: Type.Optional(
    Type.String({
      description: 'Device name or UDID (e.g. "My Mac", "iPhone").',
    }),
  ),
  configuration: Type.Optional(
    Type.String({ description: "Build configuration (Debug/Release)." }),
  ),
  force: Type.Optional(
    Type.Boolean({
      description:
        "Overwrite existing config. Only use when user explicitly requests.",
    }),
  ),
  projectDir: Type.Optional(
    Type.String({ description: "Project directory for config operations." }),
  ),
});

export type ConfigParamsType = Static<typeof ConfigParams>;

// --- Build tool actions ---

export const BUILD_ACTIONS = ["build", "clean"] as const;

export const BuildParams = Type.Object({
  action: StringEnum(BUILD_ACTIONS, {
    description: "Build action to perform.",
  }),
  workspace: Type.Optional(
    Type.String({ description: "Path to .xcworkspace or .xcodeproj." }),
  ),
  scheme: Type.Optional(Type.String({ description: "Scheme name." })),
  simulator: Type.Optional(
    Type.String({ description: "Simulator name or UDID." }),
  ),
  device: Type.Optional(
    Type.String({ description: 'Device name (e.g. "My Mac").' }),
  ),
  configuration: Type.Optional(
    Type.String({ description: "Build configuration (Debug/Release)." }),
  ),
  derivedDataPath: Type.Optional(
    Type.String({ description: "Custom derived data path." }),
  ),
  xcodebuildOptions: Type.Optional(
    Type.String({ description: "Extra xcodebuild arguments." }),
  ),
  showWarnings: Type.Optional(
    Type.Boolean({ description: "Show compiler warnings." }),
  ),
  cleanAll: Type.Optional(
    Type.Boolean({ description: "Clean all caches (clean action only)." }),
  ),
});

export type BuildParamsType = Static<typeof BuildParams>;

// --- Run tool actions ---

export const RUN_ACTIONS = [
  "run",
  "apps",
  "logs",
  "stop",
  "uninstall",
] as const;

export const RunParams = Type.Object({
  action: StringEnum(RUN_ACTIONS, {
    description: "Run/app lifecycle action to perform.",
  }),
  workspace: Type.Optional(
    Type.String({ description: "Path to .xcworkspace or .xcodeproj." }),
  ),
  scheme: Type.Optional(Type.String({ description: "Scheme name." })),
  simulator: Type.Optional(
    Type.String({ description: "Simulator name or UDID." }),
  ),
  device: Type.Optional(
    Type.String({ description: 'Device name (e.g. "My Mac").' }),
  ),
  configuration: Type.Optional(
    Type.String({ description: "Build configuration." }),
  ),
  log: Type.Optional(
    Type.Boolean({ description: "Stream logs after launch (run action)." }),
  ),
  noBuild: Type.Optional(
    Type.Boolean({
      description: "Skip build and launch existing app (run action).",
    }),
  ),
  launchOptions: Type.Optional(
    Type.String({ description: "App launch arguments (run action)." }),
  ),
  launchEnv: Type.Optional(
    Type.String({
      description: "App launch environment variables (run action).",
    }),
  ),
  identifier: Type.Optional(
    Type.String({
      description:
        "App identifier for logs/stop/uninstall. Get from apps action.",
    }),
  ),
  stopAll: Type.Optional(
    Type.Boolean({ description: "Stop all running apps (stop action)." }),
  ),
  force: Type.Optional(
    Type.Boolean({
      description: "Force kill (stop action) or force uninstall.",
    }),
  ),
  showAll: Type.Optional(
    Type.Boolean({
      description: "Show all apps including stopped (apps action).",
    }),
  ),
  prune: Type.Optional(
    Type.Boolean({ description: "Prune stale entries (apps action)." }),
  ),
  targetSimulator: Type.Optional(
    Type.String({ description: "Simulator name for uninstall." }),
  ),
});

export type RunParamsType = Static<typeof RunParams>;

// --- Test tool actions ---

export const TEST_ACTIONS = ["test", "discover", "plans"] as const;

export const TestParams = Type.Object({
  action: StringEnum(TEST_ACTIONS, {
    description: "Test action to perform.",
  }),
  workspace: Type.Optional(
    Type.String({ description: "Path to .xcworkspace or .xcodeproj." }),
  ),
  scheme: Type.Optional(Type.String({ description: "Scheme name." })),
  simulator: Type.Optional(
    Type.String({ description: "Simulator name or UDID." }),
  ),
  device: Type.Optional(
    Type.String({ description: 'Device name (e.g. "My Mac").' }),
  ),
  only: Type.Optional(
    Type.String({
      description:
        "Run only specific tests (Target/Class or Target/Class/method).",
    }),
  ),
  skip: Type.Optional(Type.String({ description: "Skip specific tests." })),
  plan: Type.Optional(Type.String({ description: "Test plan name or path." })),
  filter: Type.Optional(
    Type.String({ description: "Filter tests by name (discover action)." }),
  ),
  progress: Type.Optional(
    Type.Boolean({ description: "Show test results as they complete." }),
  ),
  includeSkipped: Type.Optional(
    Type.Boolean({ description: "Include skipped tests (discover action)." }),
  ),
  testTargets: Type.Optional(
    Type.String({ description: "Comma-separated test targets." }),
  ),
  xcodebuildOptions: Type.Optional(
    Type.String({ description: "Extra xcodebuild arguments." }),
  ),
});

export type TestParamsType = Static<typeof TestParams>;

// --- Simulator tool actions ---

export const APPEARANCE_VALUES = ["light", "dark"] as const;

export const SIMULATOR_ACTIONS = [
  "list",
  "boot",
  "shutdown",
  "create",
  "delete",
  "erase",
  "clone",
  "prune",
  "launch",
  "list_apps",
  "app_container",
  "app_info",
  "record",
  "appearance_get",
  "appearance_set",
  "appearance_reset",
  "orientation_get",
  "orientation_set",
  "content_size_get",
  "content_size_set",
  "content_size_reset",
  "language_get",
  "language_set",
  "language_reset",
  "status_bar_list",
  "status_bar_override",
  "status_bar_clear",
  "location_set",
  "location_clear",
  "pasteboard_get",
  "pasteboard_set",
  "pasteboard_clear",
  "privacy",
  "push",
  "runtime_list",
  "runtime_available",
  "runtime_install",
  "runtime_delete",
] as const;

export const CONTENT_SIZES = [
  "extra-small",
  "small",
  "medium",
  "large",
  "extra-large",
  "extra-extra-large",
  "extra-extra-extra-large",
  "accessibility-medium",
  "accessibility-large",
  "accessibility-extra-large",
  "accessibility-extra-extra-large",
  "accessibility-extra-extra-extra-large",
  "increment",
  "decrement",
] as const;

export const ORIENTATIONS = [
  "portrait",
  "landscape-left",
  "landscape-right",
  "portrait-upside-down",
] as const;

export const PRIVACY_ACTIONS = ["grant", "revoke", "reset"] as const;

export const PRIVACY_SERVICES = [
  "all",
  "calendar",
  "contacts",
  "contacts-limited",
  "location",
  "location-always",
  "photos",
  "photos-add",
  "media-library",
  "microphone",
  "motion",
  "reminders",
  "siri",
] as const;

export const APP_CONTAINERS = ["app", "data", "groups"] as const;

export const SimulatorParams = Type.Object({
  action: StringEnum(SIMULATOR_ACTIONS, {
    description: "Simulator action to perform.",
  }),
  simulator: Type.Optional(
    Type.String({
      description:
        "Simulator name or UDID for state/inspection actions. Defaults to the booted simulator.",
    }),
  ),
  bundleId: Type.Optional(
    Type.String({
      description:
        "App bundle identifier for launch, app_container, app_info, privacy, and push.",
    }),
  ),
  appearance: Type.Optional(
    StringEnum(APPEARANCE_VALUES, {
      description: "Appearance for appearance_set (light or dark).",
    }),
  ),
  orientation: Type.Optional(
    StringEnum(ORIENTATIONS, {
      description: "Target orientation for orientation_set.",
    }),
  ),
  contentSize: Type.Optional(
    StringEnum(CONTENT_SIZES, {
      description: "Dynamic Type category for content_size_set.",
    }),
  ),
  language: Type.Optional(
    Type.String({
      description: "Language code for language_set (e.g. en, fr, es-419).",
    }),
  ),
  locale: Type.Optional(
    Type.String({
      description:
        "Locale identifier for language_set (e.g. en_US). Defaults to the language code.",
    }),
  ),
  coordinates: Type.Optional(
    Type.String({
      description: "Coordinates as 'latitude,longitude' for location_set.",
    }),
  ),
  text: Type.Optional(
    Type.String({ description: "Text to copy for pasteboard_set." }),
  ),
  privacyAction: Type.Optional(
    StringEnum(PRIVACY_ACTIONS, {
      description: "Privacy action: grant, revoke, or reset.",
    }),
  ),
  privacyService: Type.Optional(
    StringEnum(PRIVACY_SERVICES, {
      description: "Privacy service to change for the privacy action.",
    }),
  ),
  payloadPath: Type.Optional(
    Type.String({
      description: "Path to a JSON push payload containing an 'aps' key.",
    }),
  ),
  container: Type.Optional(
    StringEnum(APP_CONTAINERS, {
      description: "Container kind for app_container. Defaults to app.",
    }),
  ),
  statusBar: Type.Optional(
    Type.Object(
      {
        time: Type.Optional(
          Type.String({ description: "Time string, e.g. '9:41'." }),
        ),
        dataNetwork: Type.Optional(
          Type.String({ description: "hide, wifi, 3g, 4g, lte, 5g, ..." }),
        ),
        wifiMode: Type.Optional(
          Type.String({ description: "searching, failed, or active." }),
        ),
        wifiBars: Type.Optional(Type.Number({ description: "0-3." })),
        cellularMode: Type.Optional(
          Type.String({
            description: "notSupported, searching, failed, or active.",
          }),
        ),
        cellularBars: Type.Optional(Type.Number({ description: "0-4." })),
        operatorName: Type.Optional(
          Type.String({ description: "Carrier name. Empty string clears it." }),
        ),
        batteryState: Type.Optional(
          Type.String({ description: "charging, charged, or discharging." }),
        ),
        batteryLevel: Type.Optional(Type.Number({ description: "0-100." })),
      },
      {
        description:
          "Status bar overrides for status_bar_override. Use for clean screenshots.",
      },
    ),
  ),
  output: Type.Optional(
    Type.String({ description: "Output video path for the record action." }),
  ),
  duration: Type.Optional(
    Type.String({
      description: "Recording duration for the record action, e.g. '10s'.",
    }),
  ),
  codec: Type.Optional(
    Type.String({ description: "Video codec for record: h264 or hevc." }),
  ),
  udid: Type.Optional(
    Type.String({
      description: "Simulator UDID. Required for boot/shutdown/erase.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "Simulator name. Required for create/clone. Also accepted for boot/shutdown.",
    }),
  ),
  deviceType: Type.Optional(
    Type.String({
      description: "Device type for create (e.g. iPhone 16 Pro).",
    }),
  ),
  runtime: Type.Optional(
    Type.String({
      description:
        "Runtime for create (e.g. iOS 18.1) or runtime install/delete.",
    }),
  ),
  platform: Type.Optional(
    Type.String({
      description: "Platform filter (iOS, tvOS, watchOS, visionOS).",
    }),
  ),
  source: Type.Optional(
    Type.String({ description: "Source simulator name or UDID for clone." }),
  ),
  availableOnly: Type.Optional(
    Type.Boolean({
      description: "Show only available simulators (list action).",
    }),
  ),
  unavailable: Type.Optional(
    Type.Boolean({
      description: "Delete unavailable simulators (delete action).",
    }),
  ),
  dryRun: Type.Optional(
    Type.Boolean({ description: "Dry run for prune action." }),
  ),
  version: Type.Optional(
    Type.String({ description: "Runtime version for install (e.g. 18.0)." }),
  ),
  runtimePrune: Type.Optional(
    Type.Boolean({
      description: "Prune auto-created simulators after runtime install.",
    }),
  ),
});

export type SimulatorParamsType = Static<typeof SimulatorParams>;

// --- Device tool actions ---

export const DEVICE_ACTIONS = [
  "list",
  "install",
  "uninstall",
  "launch",
] as const;

export const DeviceParams = Type.Object({
  action: StringEnum(DEVICE_ACTIONS, {
    description: "Device action to perform.",
  }),
  udid: Type.Optional(
    Type.String({
      description: "Device UDID. Required for install/uninstall/launch.",
    }),
  ),
  appPath: Type.Optional(
    Type.String({ description: "Path to .app bundle (install action)." }),
  ),
  bundleId: Type.Optional(
    Type.String({
      description: "Bundle identifier (uninstall/launch actions).",
    }),
  ),
  platform: Type.Optional(
    Type.String({ description: "Platform filter (list action)." }),
  ),
  availableOnly: Type.Optional(
    Type.Boolean({ description: "Show only available devices (list action)." }),
  ),
});

export type DeviceParamsType = Static<typeof DeviceParams>;

// --- UI Simulator actions ---

export const UI_SIMULATOR_ACTIONS = [
  "session_start",
  "session_stop",
  "tap",
  "double_tap",
  "type",
  "swipe",
  "scroll",
  "find",
  "wait",
  "assert",
  "screen",
  "batch",
  "back",
  "pinch",
  "erase",
  "hide_keyboard",
  "key",
  "open_url",
  "clear_state",
  "rotate",
  "touch_down",
  "touch_up",
  "set_appearance",
  "button",
] as const;

export const UI_SIMULATOR_ASSERTIONS = [
  "visible",
  "hidden",
  "enabled",
  "disabled",
] as const;

export const SWIPE_DIRECTIONS = ["up", "down", "left", "right"] as const;
export const SCROLL_DIRECTIONS = ["UP", "DOWN", "LEFT", "RIGHT"] as const;
export const PINCH_DIRECTIONS = ["in", "out"] as const;
export const HARDWARE_BUTTONS = [
  "home",
  "lock",
  "siri",
  "applepay",
  "volumeup",
  "volumedown",
] as const;

export const UiSimulatorParams = Type.Object({
  action: StringEnum(UI_SIMULATOR_ACTIONS, {
    description: "iOS Simulator UI action.",
  }),
  simulator: Type.Optional(
    Type.String({ description: 'Simulator name or UDID (e.g. "iPhone 16").' }),
  ),
  target: Type.Optional(
    Type.String({
      description:
        "Element to interact with (label, ID, or accessibility identifier).",
    }),
  ),
  byId: Type.Optional(
    Type.Boolean({ description: "Treat target as accessibility identifier." }),
  ),
  byRole: Type.Optional(
    Type.Boolean({ description: "Search by element role (find action)." }),
  ),
  contains: Type.Optional(
    Type.Boolean({ description: "Match elements containing the text." }),
  ),
  text: Type.Optional(
    Type.String({ description: "Text to type (type action)." }),
  ),
  clear: Type.Optional(
    Type.Boolean({
      description: "Clear field before typing (type/erase actions).",
    }),
  ),
  mask: Type.Optional(
    Type.Boolean({ description: "Mask typed text in output (type action)." }),
  ),
  direction: Type.Optional(
    StringEnum(SWIPE_DIRECTIONS, { description: "Swipe/scroll direction." }),
  ),
  scrollDirection: Type.Optional(
    StringEnum(SCROLL_DIRECTIONS, {
      description: "Scroll direction by content.",
    }),
  ),
  pinchDirection: Type.Optional(
    StringEnum(PINCH_DIRECTIONS, { description: "Pinch direction (in/out)." }),
  ),
  point: Type.Optional(
    Type.String({ description: "Coordinates as x,y (e.g. 120,340)." }),
  ),
  until: Type.Optional(
    Type.String({
      description: "Scroll until element is visible (scroll action).",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: "Timeout in seconds (wait/scroll-until actions).",
    }),
  ),
  duration: Type.Optional(
    Type.Number({
      description: "Duration in seconds (tap-hold, swipe, record).",
    }),
  ),
  distance: Type.Optional(
    Type.String({
      description: "Swipe/scroll distance as fraction (0.05-0.95).",
    }),
  ),
  speed: Type.Optional(Type.Number({ description: "Scroll speed 0-100." })),
  scale: Type.Optional(Type.Number({ description: "Pinch scale factor." })),
  assertion: Type.Optional(
    StringEnum(UI_SIMULATOR_ASSERTIONS, {
      description: "Assertion type (assert action).",
    }),
  ),
  expected: Type.Optional(
    Type.String({ description: "Expected text value (assert action)." }),
  ),
  url: Type.Optional(
    Type.String({ description: "URL to open (open_url action)." }),
  ),
  bundleId: Type.Optional(
    Type.String({ description: "Bundle ID (clear_state action)." }),
  ),
  keycode: Type.Optional(
    Type.Number({ description: "HID keycode (key action)." }),
  ),
  sequence: Type.Optional(
    Type.String({ description: "Comma-separated HID keycodes (key action)." }),
  ),
  angle: Type.Optional(
    Type.Number({ description: "Rotation angle in degrees (rotate action)." }),
  ),
  appearance: Type.Optional(
    StringEnum(APPEARANCE_VALUES, {
      description: "Appearance mode (set_appearance action).",
    }),
  ),
  hardwareButton: Type.Optional(
    StringEnum(HARDWARE_BUTTONS, {
      description: "Hardware button to press (button action).",
    }),
  ),
  characters: Type.Optional(
    Type.Number({
      description: "Number of characters to erase (erase action).",
    }),
  ),
  condition: Type.Optional(
    StringEnum(["exists", "gone", "enabled", "stable"] as const, {
      description: "Wait condition (wait action).",
    }),
  ),
  intervalMs: Type.Optional(
    Type.Number({
      description: "Session capture interval in ms (session_start action).",
    }),
  ),
  output: Type.Optional(
    Type.String({ description: "Output path for the captured screenshot." }),
  ),
  optimize: Type.Optional(
    Type.Boolean({
      description: "Optimize screenshot for agents (screen action).",
    }),
  ),
  treeOnly: Type.Optional(
    Type.Boolean({
      description:
        "Skip the screenshot and return the accessibility tree only (screen action). Cheaper; prefer it unless you need pixels.",
    }),
  ),
  screenshot: Type.Optional(
    Type.Boolean({
      description:
        "Attach the current session screenshot to the result. Off by default for gestures; the accessibility tree is the source of truth.",
    }),
  ),
  interactiveElements: Type.Optional(
    Type.Boolean({
      description:
        "Return only interactive elements instead of the full tree (screen and batch actions). Large token saving.",
    }),
  ),
  sinceHash: Type.Optional(
    Type.String({
      description:
        "Screen hash from a previous screen call. Returns 'unchanged' instead of the full tree when the screen has not changed.",
    }),
  ),
  steps: Type.Optional(
    Type.String({
      description:
        "JSON array of action steps for the batch action. Runs a whole flow in one call and returns the final tree.",
    }),
  ),
  stepsFile: Type.Optional(
    Type.String({
      description: "Path to a JSON file of action steps (batch action).",
    }),
  ),
  smooth: Type.Optional(Type.Boolean({ description: "Smooth scrolling." })),
  hold: Type.Optional(
    Type.Number({ description: "Hold duration for button press." }),
  ),
});

export type UiSimulatorParamsType = Static<typeof UiSimulatorParams>;

// --- UI Mac actions ---

export const UI_MAC_ACTIONS = [
  "session_start",
  "session_stop",
  "screen",
  "click",
  "double_click",
  "right_click",
  "type",
  "erase",
  "key",
  "hotkey",
  "scroll",
  "move",
  "drag",
  "swipe",
  "find",
  "wait",
  "assert",
  "launch",
  "activate",
  "quit",
  "window_list",
  "window_move",
  "window_resize",
  "window_focus",
  "menu_list",
  "menu_click",
  "list_apps",
  "list_windows",
  "list_screens",
  "check_permissions",
  "request_permissions",
] as const;

export const UI_MAC_ASSERTIONS = [
  "visible",
  "hidden",
  "enabled",
  "disabled",
  "text",
] as const;

export const MAC_SCROLL_DIRECTIONS = ["up", "down", "left", "right"] as const;

export const UiMacParams = Type.Object({
  action: StringEnum(UI_MAC_ACTIONS, {
    description: "macOS UI automation action.",
  }),
  app: Type.Optional(
    Type.String({
      description:
        'Target app name, bundle ID, or PID (e.g. "MyApp", "com.example.app", "12345").',
    }),
  ),
  target: Type.Optional(
    Type.String({
      description: "Element to interact with (click/find/wait/etc.).",
    }),
  ),
  byId: Type.Optional(
    Type.Boolean({ description: "Treat target as accessibility identifier." }),
  ),
  byRole: Type.Optional(
    Type.Boolean({ description: "Search by element role (find action)." }),
  ),
  contains: Type.Optional(
    Type.Boolean({ description: "Substring match against labels." }),
  ),
  text: Type.Optional(
    Type.String({ description: "Text to type (type action)." }),
  ),
  clear: Type.Optional(
    Type.Boolean({ description: "Clear field before typing." }),
  ),
  mask: Type.Optional(
    Type.Boolean({ description: "Mask typed text in output." }),
  ),
  delayMs: Type.Optional(
    Type.Number({ description: "Per-character delay in ms (type action)." }),
  ),
  point: Type.Optional(
    Type.String({ description: 'Coordinates as "x,y" (screen-absolute).' }),
  ),
  from: Type.Optional(Type.String({ description: 'Drag start point "x,y".' })),
  to: Type.Optional(
    Type.String({
      description: 'Drag/move end point "x,y" (or window move "x,y").',
    }),
  ),
  keyName: Type.Optional(
    Type.String({
      description:
        "Key name: return, escape, tab, delete, space, f1-f12, arrows, etc.",
    }),
  ),
  keycode: Type.Optional(Type.Number({ description: "Raw virtual keycode." })),
  combo: Type.Optional(
    Type.String({
      description: 'Keyboard shortcut combo, e.g. "cmd+s", "cmd+shift+z".',
    }),
  ),
  direction: Type.Optional(
    StringEnum(MAC_SCROLL_DIRECTIONS, { description: "Scroll direction." }),
  ),
  amount: Type.Optional(
    Type.Number({ description: "Scroll magnitude in discrete ticks." }),
  ),
  smooth: Type.Optional(Type.Boolean({ description: "Smooth scrolling." })),
  until: Type.Optional(
    Type.String({ description: "Scroll until element is visible." }),
  ),
  scrollTimeout: Type.Optional(
    Type.Number({ description: "Timeout for scroll-until in seconds." }),
  ),
  size: Type.Optional(Type.String({ description: 'Window resize "w,h".' })),
  index: Type.Optional(
    Type.Number({ description: "Window index for move/resize/focus." }),
  ),
  menuPath: Type.Optional(
    Type.String({
      description: 'Menu path separated by ">", e.g. "File > Save".',
    }),
  ),
  bundleId: Type.Optional(
    Type.String({ description: "Bundle ID for launch action." }),
  ),
  duration: Type.Optional(
    Type.Number({ description: "Duration for click/drag/swipe." }),
  ),
  distance: Type.Optional(
    Type.Number({ description: "Swipe distance in points." }),
  ),
  assertion: Type.Optional(
    StringEnum(UI_MAC_ASSERTIONS, { description: "Assertion type." }),
  ),
  expected: Type.Optional(
    Type.String({ description: "Expected text value (assert text action)." }),
  ),
  condition: Type.Optional(
    StringEnum(["exists", "gone", "enabled", "stable"] as const, {
      description: "Wait condition.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in seconds (wait action)." }),
  ),
  force: Type.Optional(
    Type.Boolean({ description: "Force quit (quit action)." }),
  ),
  includeAgents: Type.Optional(
    Type.Boolean({
      description: "Include background agent apps (list_apps action).",
    }),
  ),
  includeSystem: Type.Optional(
    Type.Boolean({
      description: "Include system processes (list_apps action).",
    }),
  ),
  characters: Type.Optional(
    Type.Number({ description: "Characters to erase (erase action)." }),
  ),
  output: Type.Optional(
    Type.String({ description: "Output path for screenshot." }),
  ),
  treeOnly: Type.Optional(
    Type.Boolean({ description: "Tree only (screen action)." }),
  ),
  intervalMs: Type.Optional(
    Type.Number({ description: "Session capture interval in ms." }),
  ),
  screenshot: Type.Optional(
    Type.Boolean({
      description:
        "Attach the current session screenshot to the result. Off by default for gestures; the accessibility tree is the source of truth.",
    }),
  ),
});

export type UiMacParamsType = Static<typeof UiMacParams>;
