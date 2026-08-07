// Smoke test for the published artifact.
//
// The package is bundle:false and bundler-resolved, so its public entrypoints
// are easy to break under raw Node ESM (extensionless / directory imports).
// This runs the built dist the way a published consumer would: it imports the
// reference entry (ESM + CJS) and reads the catalogue JSON, failing loudly if
// any entrypoint no longer resolves. Run after `pnpm build`.

import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  "@sero-ai/ui/ai-elements",
  "@sero-ai/ui/model-selection",
  "@sero-ai/ui/components/context-editor",
  "components/ai-elements",
  "components/model-selection",
  "components/context-editor",
  "mermaid",
  "shiki",
  "react-jsx-parser",
  "streamdown",
  "unified",
];

const importPatterns = [
  /(?:from\s+|import\s*)["'](\.[^"']+)["']/g,
  /(?:require|import)\(\s*["'](\.[^"']+)["']\s*\)/g,
];

function localImports(contents) {
  return importPatterns.flatMap((pattern) =>
    [...contents.matchAll(pattern)].map((match) => match[1]),
  );
}

function emittedExtension(file) {
  if (file.endsWith(".d.cts")) return ".d.cts";
  if (file.endsWith(".d.ts")) return ".d.ts";
  if (file.endsWith(".cjs")) return ".cjs";
  return ".js";
}

function resolveLocalImport(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const extension = emittedExtension(fromFile);
  const candidates = [];

  if (extension.startsWith(".d.") && specifier.endsWith(".js")) {
    candidates.push(base.replace(/\.js$/, extension));
  }
  candidates.push(base, `${base}${extension}`, resolve(base, `index${extension}`));

  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function inspectRootGraph(entry) {
  const pending = [resolve(dist, entry)];
  const visited = new Set();

  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);

    const contents = readFileSync(file, "utf8");
    const relativeFile = file.slice(dist.length + 1);
    const leak = forbiddenRootImports.find(
      (dependency) =>
        relativeFile.includes(dependency) || contents.includes(dependency),
    );
    if (leak) fail(`${relativeFile} exposes unrelated dependency ${leak}`);

    for (const specifier of localImports(contents)) {
      const dependency = resolveLocalImport(file, specifier);
      if (dependency) pending.push(dependency);
      else fail(`${relativeFile} has unresolved local import ${specifier}`);
    }
  }
}

for (const file of rootEntries) {
  inspectRootGraph(file);
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
for (const style of [
  "styles/ai-elements.css",
  "styles/model-selection.css",
  "styles/context-editor.css",
]) {
  if (!existsSync(resolve(dist, style))) fail(`${style} not emitted to dist`);
}

// 1. Reference entrypoint resolves as ESM and exposes the example widgets.
const EXPECTED = [
  "StarterExample",
  "SchedulerExample",
  "ResourceExample",
  "ActivityExample",
];

const esm = await import(pathToFileURL(resolve(dist, "reference.js")).href);
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
