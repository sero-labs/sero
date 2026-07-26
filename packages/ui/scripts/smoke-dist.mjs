// Smoke test for the published artifact.
//
// The package is bundle:false and bundler-resolved, so its public entrypoints
// are easy to break under raw Node ESM (extensionless / directory imports).
// This runs the built dist the way a published consumer would: it imports the
// reference entry (ESM + CJS) and reads the catalogue JSON, failing loudly if
// any entrypoint no longer resolves. Run after `pnpm build`.

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");
const packageRoot = resolve(here, "..");

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};

if (!existsSync(dist)) {
  fail("dist/ is missing — run `pnpm build` first");
  process.exit(1);
}

// The lightweight root must not re-export specialized dependency graphs.
const rootEntries = ["index.js", "index.cjs", "index.d.ts", "index.d.cts"];
const forbiddenRootImports = [
  "components/ai-elements",
  "components/model-selection",
  "mermaid",
  "shiki",
  "react-jsx-parser",
  "streamdown",
];

for (const file of rootEntries) {
  const contents = readFileSync(resolve(dist, file), "utf8");
  const leak = forbiddenRootImports.find((dependency) =>
    contents.includes(dependency),
  );
  if (leak) fail(`${file} exposes unrelated dependency ${leak}`);
}

// Specialized components remain available through stable public subpaths.
const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
);
for (const [subpath, output] of [
  ["./ai-elements/*", "components/ai-elements/message.js"],
  ["./model-selection/*", "components/model-selection/available-model-picker.js"],
]) {
  if (!packageJson.publishConfig.exports[subpath]) {
    fail(`publishConfig is missing ${subpath}`);
  }
  if (!existsSync(resolve(dist, output))) fail(`${output} not emitted to dist`);
}

// 1. Reference entrypoint resolves as ESM and exposes the example widgets.
const EXPECTED = [
  "StarterExample",
  "SchedulerExample",
  "ResourceExample",
  "ActivityExample",
];

const esm = await import(resolve(dist, "reference.js"));
for (const name of EXPECTED) {
  if (typeof esm[name] !== "function") fail(`reference.js missing export ${name}`);
}

// 2. Reference entrypoint resolves as CJS too.
const cjs = require(resolve(dist, "reference.cjs"));
for (const name of EXPECTED) {
  if (typeof cjs[name] !== "function") fail(`reference.cjs missing export ${name}`);
}

// The publishConfig `types` map points at these; a clean-race once dropped them.
for (const f of ["reference.d.ts", "reference.d.cts"]) {
  if (!existsSync(resolve(dist, f))) fail(`${f} not emitted to dist`);
}

// 3. Catalogue ships as plain JSON with the expected shape.
const catalogPath = resolve(dist, "components", "dashboard", "catalog.json");
if (!existsSync(catalogPath)) fail("dashboard-catalog.json not emitted to dist");
else {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!Array.isArray(catalog) || catalog.length === 0) {
    fail("dashboard-catalog.json is not a non-empty array");
  } else if (!catalog.every((e) => e.name && e.category && e.kind)) {
    fail("dashboard-catalog.json has malformed entries");
  }
}

if (process.exitCode) {
  console.error("Smoke test failed.");
} else {
  console.log(
    "✓ dist entrypoints resolve and the root excludes specialized dependencies",
  );
}
