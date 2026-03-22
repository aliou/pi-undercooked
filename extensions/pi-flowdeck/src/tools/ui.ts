import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFlowdeckTool } from "./shared";

export function registerUiTool(pi: ExtensionAPI) {
  registerFlowdeckTool(pi, {
    name: "flowdeck_ui",
    label: "FlowDeck UI",
    description: "Simulator UI automation commands.",
    subcommand: ["ui", "simulator"],
    actions: {
      screen: ["screen"],
      session_start: ["session", "start"],
      session_stop: ["session", "stop"],
      record: ["record"],
      find: ["find"],
      tap: ["tap"],
      double_tap: ["double-tap"],
      type: ["type"],
      swipe: ["swipe"],
      scroll: ["scroll"],
      back: ["back"],
      pinch: ["pinch"],
      wait: ["wait"],
      assert_visible: ["assert", "visible"],
      assert_hidden: ["assert", "hidden"],
      assert_enabled: ["assert", "enabled"],
      assert_disabled: ["assert", "disabled"],
      assert_text: ["assert", "text"],
      erase: ["erase"],
      hide_keyboard: ["hide-keyboard"],
      key: ["key"],
      open_url: ["open-url"],
      clear_state: ["clear-state"],
      rotate: ["rotate"],
      button: ["button"],
      touch_down: ["touch", "down"],
      touch_up: ["touch", "up"],
    },
  });
}
