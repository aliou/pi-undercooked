import type { Component } from "@earendil-works/pi-tui";
import { Container } from "@earendil-works/pi-tui";

/**
 * Create a Container with a single child component.
 * Avoids the `new Container().addChild(x)` pattern which returns void.
 */
export function containerWith(child: Component): Container {
  const c = new Container();
  c.addChild(child);
  return c;
}

/**
 * Create a Container with multiple child components.
 */
export function containerWithChildren(...children: Component[]): Container {
  const c = new Container();
  for (const child of children) {
    c.addChild(child);
  }
  return c;
}
