import { defineConfig } from "tsup";

// Reference examples are a public entrypoint, so bundle them into a single
// self-contained file that resolves under Node ESM (the rest of the package is
// bundler-resolved). Runtime deps stay external; only local component code is
// inlined. Runs after the mirror pass (tsup.config.ts) with `clean: false`, so
// it adds dist/reference.* without wiping the mirrored output.
export default defineConfig({
  entry: ["src/reference.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: false,
  splitting: false,
  bundle: true,
});
