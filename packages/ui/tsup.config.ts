import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

export default defineConfig({
  // Tells tsup to grab everything in your src directory
  entry: ["src/**/*.{ts,tsx}"],
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
