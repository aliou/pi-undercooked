import type { OutputStyle } from "./styles/types";
import { OFF_STYLE } from "./styles/types";

/**
 * Module-level state for the output style extension.
 */
interface ExtensionState {
  /** Currently active style, or null if none/off */
  activeStyle: OutputStyle | null;
  /** All loaded styles by lowercase name */
  loadedStyles: Map<string, OutputStyle>;
}

const state: ExtensionState = {
  activeStyle: null,
  loadedStyles: new Map(),
};

/**
 * Get the currently active style.
 */
export function getActiveStyle(): OutputStyle | null {
  return state.activeStyle;
}

/**
 * Set the active style by name.
 * Returns true if the style was found and set.
 */
export function setActiveStyle(name: string): boolean {
  if (name === OFF_STYLE) {
    state.activeStyle = null;
    return true;
  }

  const style = state.loadedStyles.get(name.toLowerCase());
  if (style) {
    state.activeStyle = style;
    return true;
  }
  return false;
}

/**
 * Clear the active style (set to null).
 */
export function clearActiveStyle(): void {
  state.activeStyle = null;
}

/**
 * Get all loaded styles.
 */
export function getLoadedStyles(): Map<string, OutputStyle> {
  return state.loadedStyles;
}

/**
 * Set the loaded styles map.
 */
export function setLoadedStyles(styles: Map<string, OutputStyle>): void {
  state.loadedStyles = styles;
}

/**
 * Check if a style name is valid (exists in loaded styles).
 */
export function isValidStyle(name: string): boolean {
  return name === OFF_STYLE || state.loadedStyles.has(name.toLowerCase());
}

/**
 * Get style names sorted for display.
 */
export function getStyleNames(): string[] {
  const names: string[] = [];
  for (const style of state.loadedStyles.values()) {
    names.push(style.name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}
