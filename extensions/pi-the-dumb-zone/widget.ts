import type {
  ExtensionContext,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { DumbZoneCheckResult } from "./checks";
import { DUMB_ZONE_MESSAGE, WIDGET_ALERT_COOLDOWN_MS } from "./constants";

const WIDGET_ID = "dumb-zone";

let lastAlertTime = 0;

class DumbZoneWidget {
  constructor(
    private readonly theme: Theme,
    private readonly result: DumbZoneCheckResult,
  ) {}

  handleInput(_data: string): void {}

  render(width: number): string[] {
    const maxWidth = Math.max(1, width);
    const severity = getSeverity(this.result);
    const badge = this.theme.fg(
      severity,
      this.theme.bold(`[${DUMB_ZONE_MESSAGE}]`),
    );

    const detailsColor: ThemeColor =
      this.result.violationType === "pattern" ? "warning" : "muted";
    const details = this.theme.fg(
      detailsColor,
      truncateToWidth(this.result.details, maxWidth, "..."),
    );

    return [truncateToWidth(`${badge} ${details}`, maxWidth, "...")];
  }

  invalidate(): void {}
}

function getSeverity(result: DumbZoneCheckResult): ThemeColor {
  if (result.violationType === "pattern") {
    return "warning";
  }

  const ratio =
    result.threshold > 0 ? result.utilization / result.threshold : 0;

  if (ratio >= 1.5) {
    return "error";
  }

  return "warning";
}

export function resetDumbZoneWidgetState(): void {
  lastAlertTime = 0;
}

export function clearDumbZoneWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.setWidget(WIDGET_ID, undefined);
}

export function showDumbZoneWidget(
  ctx: ExtensionContext,
  result: DumbZoneCheckResult,
): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.setWidget(
    WIDGET_ID,
    (_tui, theme) => new DumbZoneWidget(theme, result),
    { placement: "belowEditor" },
  );
}

export function maybeNotifyDumbZone(
  ctx: ExtensionContext,
  result: DumbZoneCheckResult,
): void {
  if (!ctx.hasUI) {
    return;
  }

  const now = Date.now();
  if (now - lastAlertTime < WIDGET_ALERT_COOLDOWN_MS) {
    return;
  }

  lastAlertTime = now;

  const message =
    result.violationType === "pattern"
      ? `Dumb zone warning: ${result.details}`
      : `Dumb zone detected: ${result.details}`;

  ctx.ui.notify(message, "warning");
}
