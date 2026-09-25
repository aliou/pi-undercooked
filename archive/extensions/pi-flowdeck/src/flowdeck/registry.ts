/**
 * Shared in-memory session registry.
 *
 * This module owns the singleton SessionRegistry instance so that
 * multiple tool modules (session, ui-simulator, ui-mac) can access
 * the same state without circular imports.
 *
 * The session tool is the primary writer. UI tools are readers.
 */

import { createEmptyRegistry, type SessionRegistry } from "./session-state";

let registry: SessionRegistry = createEmptyRegistry();

/** Get the current session registry. */
export function getRegistry(): SessionRegistry {
  return registry;
}

/** Replace the registry (used by session tool on reconstruction). */
export function setRegistry(newRegistry: SessionRegistry): void {
  registry = newRegistry;
}
