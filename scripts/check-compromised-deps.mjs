#!/usr/bin/env node
// Scans pnpm-lock.yaml for package@version pairs known to be compromised in
// npm supply-chain attacks (currently: the Aug 2026 keyv/cacheable worm).
// Compromised list lives in scripts/data/compromised-deps.json — refresh it
// from the `source` URL in that file when the campaign grows.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lockPath = path.join(rootDir, "pnpm-lock.yaml");
const dataPath = path.join(rootDir, "scripts", "data", "compromised-deps.json");

function main() {
  const { source, fetchedAt, packages } = JSON.parse(readFileSync(dataPath, "utf8"));
  const compromised = new Map(Object.entries(packages));

  const lock = readFileSync(lockPath, "utf8");
  // pnpm-lock.yaml v9 keys look like: '  keyv@5.6.0:' or "  '@cacheable/utils@2.4.1':"
  const entryPattern = /^\s*'?((?:@[^/@]+\/)?[^@'\s]+)@([^':\s]+)'?:\s*$/gm;
  const hits = [];
  let match;
  while ((match = entryPattern.exec(lock)) !== null) {
    const [, name, version] = match;
    if (compromised.get(name)?.includes(version)) {
      hits.push(`${name}@${version}`);
    }
  }

  if (hits.length > 0) {
    console.error("COMPROMISED PACKAGE VERSIONS FOUND:");
    for (const hit of hits) console.error(`  - ${hit}`);
    console.error(
      "\nDo not run install. Remove/pin these, purge node_modules, and rotate any tokens on this machine.",
    );
    process.exit(1);
  }

  console.log(
    `OK — no known-compromised versions found in ${path.basename(lockPath)} ` +
      `(checked against ${compromised.size} packages, snapshot from ${fetchedAt}: ${source}).`,
  );
}

main();
