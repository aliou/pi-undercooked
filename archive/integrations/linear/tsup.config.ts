import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server/index.ts"],
  outDir: "dist/server",
  format: "esm",
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Keep Pi SDK packages external so they resolve from node_modules at runtime.
  // @mariozechner/pi-ai is a transitive dep that esbuild cannot resolve otherwise.
  noExternal: [],
  external: [
    "@mariozechner/pi-coding-agent",
    "@mariozechner/pi-agent-core",
    "@mariozechner/pi-ai",
    "@sinclair/typebox",
  ],
});
