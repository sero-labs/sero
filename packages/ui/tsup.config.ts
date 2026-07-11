import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

// Mirror the source tree 1:1 (bundle: false) so deep imports keep working.
// The reference entry is bundled separately in tsup.reference.config.ts, which
// the build script runs *after* this pass (this one cleans; that one does not).
export default defineConfig({
  entry: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/reference.ts",
    "!src/components/reference/**",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: true,

  // This is the golden key: it stops esbuild from merging everything
  // into index.js and forces it to mirror your exact folder structure.
  bundle: false,
  onSuccess: () => {
    cpSync("src/styles", "dist/styles", { recursive: true });
    // The catalogue is plain data served as @sero-ai/ui/dashboard-catalog.json;
    // the mirror pass only emits .ts/.tsx, so copy the JSON across by hand.
    cpSync(
      "src/components/dashboard/catalog.json",
      "dist/components/dashboard/catalog.json",
    );
  },
});
