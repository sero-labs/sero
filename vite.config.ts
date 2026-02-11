import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// NOTE: We do NOT use @module-federation/vite here.
// Sero is a host-only setup with purely dynamic remotes — the MF runtime
// handles everything (init, registerRemotes, loadRemote) without a build plugin.
// The Vite plugin is only needed by remotes (extension packages) to produce remoteEntry.js.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  root: ".",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    target: "esnext",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
