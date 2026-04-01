import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { DumbZoneCheckResult } from "../checks";
import {
  getContextUtilization,
  getEffectiveThreshold,
  hasCompacted,
} from "../checks";
import { CONTEXT_THRESHOLDS } from "../constants";
import { clearDumbZoneWidget, showDumbZoneWidget } from "../widget";

function zoneLabel(
  utilization: number,
  warningThreshold: number,
  dangerThreshold: number,
  criticalThreshold: number,
): "OK" | "WARNING" | "DANGER" | "CRITICAL" {
  if (utilization >= criticalThreshold) return "CRITICAL";
  if (utilization >= dangerThreshold) return "DANGER";
  if (utilization >= warningThreshold) return "WARNING";
  return "OK";
}

function buildQuantitativeResult(
  utilization: number,
  dangerThreshold: number,
  compacted: boolean,
): DumbZoneCheckResult {
  const details = compacted
    ? `Context: ${utilization.toFixed(1)}% (threshold: ${dangerThreshold.toFixed(1)}%, post-compaction)`
    : `Context: ${utilization.toFixed(1)}% (threshold: ${dangerThreshold.toFixed(1)}%)`;

  return {
    inZone: utilization >= dangerThreshold,
    utilization,
    threshold: dangerThreshold,
    compacted,
    violationType: "quantitative",
    details,
  };
}

export function setupDumbZoneCommands(pi: ExtensionAPI): void {
  pi.registerCommand("dumb-zone-status", {
    description: "Show current dumb zone proximity status",
    handler: async (_args, ctx) => {
      const utilization = getContextUtilization(ctx);
      const compacted = hasCompacted(ctx);

      const warningThreshold = getEffectiveThreshold(
        CONTEXT_THRESHOLDS.WARNING,
        compacted,
      );
      const dangerThreshold = getEffectiveThreshold(
        CONTEXT_THRESHOLDS.DANGER,
        compacted,
      );
      const criticalThreshold = getEffectiveThreshold(
        CONTEXT_THRESHOLDS.CRITICAL,
        compacted,
      );

      const zone = zoneLabel(
        utilization,
        warningThreshold,
        dangerThreshold,
        criticalThreshold,
      );

      if (ctx.hasUI) {
        const widgetResult = buildQuantitativeResult(
          utilization,
          dangerThreshold,
          compacted,
        );

        if (widgetResult.inZone) {
          showDumbZoneWidget(ctx, widgetResult);
        } else {
          clearDumbZoneWidget(ctx);
        }
      }

      const details = compacted ? " post-compaction" : "";
      ctx.ui.notify(
        `Context ${utilization.toFixed(1)}% (${zone})${details}. Warning ${warningThreshold.toFixed(1)}%, danger ${dangerThreshold.toFixed(1)}%, critical ${criticalThreshold.toFixed(1)}%.`,
        zone === "OK" ? "info" : zone === "WARNING" ? "warning" : "error",
      );
    },
  });
}
