import path from "node:path";
import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import zip from "vite-plugin-zip-pack";
import manifestConfig from "./manifest.config";
import { name, version } from "./package.json";

const EXTENSION_NAME = "Pi Chrome";

type ManifestV3 = Extract<ManifestV3Export, { name: string; version: string }>;

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  const outDir = isProduction ? "dist-prod" : "dist-dev";

  const manifestOverrides: Partial<ManifestV3> = isProduction
    ? {
        name: EXTENSION_NAME,
      }
    : {
        name: `${EXTENSION_NAME} (dev)`,
        icons: {
          16: "images/icon-dev-16.png",
          48: "images/icon-dev-48.png",
          128: "images/icon-dev-128.png",
        },
        action: {
          default_icon: {
            16: "images/action-dev-light-16.png",
            32: "images/action-dev-light-32.png",
          },
        },
      };

  const manifest: ManifestV3 = {
    ...(manifestConfig as ManifestV3),
    ...manifestOverrides,
  };

  const zipName = isProduction
    ? `crx-${name}-${version}.zip`
    : `crx-${name}-dev-${version}.zip`;

  return {
    resolve: {
      alias: {
        "@": `${path.resolve(__dirname, "src")}`,
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      crx({ manifest }),
      zip({ inDir: outDir, outDir: "release", outFileName: zipName }),
    ],
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
    build: {
      outDir,
    },
  };
});
