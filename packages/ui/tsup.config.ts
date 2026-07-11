import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

export default defineConfig({
  // Tells tsup to grab everything in your src directory, except tests.
  entry: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/__tests__/**",
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
  },
});
