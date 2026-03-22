/**
 * Output style data model.
 */
export interface OutputStyle {
  /** Display name (e.g., "Explanatory", "Learning") */
  name: string;

  /** UI-only description shown in the style picker */
  description?: string;

  /** The actual prompt text injected into system prompt */
  prompt: string;

  /** Source of the style */
  source: "built-in" | "global" | "local";
}

/** Style identifier for the "off" state */
export const OFF_STYLE = "off";
