import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/oauth": "http://localhost:3000",
      "/webhook": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
