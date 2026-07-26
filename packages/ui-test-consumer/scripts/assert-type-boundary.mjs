import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const tsc = require.resolve("typescript/bin/tsc");
const forbidden = [
  /components\/ai-elements/,
  /node_modules\/react-jsx-parser/,
  /node_modules\/@streamdown/,
  /node_modules\/shiki/,
  /node_modules\/unified/,
];

for (const config of ["tsconfig.json", "tsconfig.published.json"]) {
  const result = spawnSync(
    process.execPath,
    [tsc, "--project", config, "--listFiles", "--pretty", "false"],
    { cwd: root, encoding: "utf8" },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const leak = result.stdout
    .split("\n")
    .find((file) => forbidden.some((pattern) => pattern.test(file)));

  if (leak) {
    throw new Error(`${config} traversed an unrelated UI dependency: ${leak}`);
  }

  console.log(`✓ ${config} keeps AI/editor types outside the root consumer`);
}
