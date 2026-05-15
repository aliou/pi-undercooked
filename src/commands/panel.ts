import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function createPanelPadder(width: number): (content: string) => string {
  const innerWidth = Math.max(0, width - 2);
  return (content: string) => {
    const safe =
      visibleWidth(content) > innerWidth
        ? truncateToWidth(content, innerWidth)
        : content;
    const pad = Math.max(0, innerWidth - visibleWidth(safe));
    return ` ${safe}${" ".repeat(pad)} `;
  };
}

export function renderPanelRule(width: number, theme: Theme): string {
  return theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
}

export function renderPanelTitleLine(
  title: string,
  width: number,
  theme: Theme,
): string {
  return createPanelPadder(width)(theme.fg("accent", theme.bold(title)));
}
