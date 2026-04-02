import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Pi Chrome",
  version: pkg.version,
  icons: {
    16: "images/icon-16.png",
    48: "images/icon-48.png",
    128: "images/icon-128.png",
  },
  action: {
    default_icon: {
      16: "images/action-light-16.png",
      32: "images/action-light-32.png",
    },
  },
  commands: {
    _execute_action: {
      suggested_key: {
        default: "Ctrl+E",
        mac: "Command+E",
      },
      description: "Toggle Pi Chrome",
    },
    "toggle-sidepanel": {
      suggested_key: {
        default: "Ctrl+Shift+E",
        mac: "Command+Shift+E",
      },
      description: "Toggle Pi Chrome sidepanel",
    },
  },
  permissions: [
    "sidePanel",
    "tabs",
    "activeTab",
    "scripting",
    "nativeMessaging",
    "debugger",
    "storage",
    "downloads",
    "offscreen",
    "webNavigation",
  ],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "src/background/main.ts",
    type: "module",
  },
  content_scripts: [
    {
      js: ["src/content/main.js"],
      matches: ["<all_urls>"],
      run_at: "document_idle",
    },
  ],
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
});
