#!/usr/bin/env node
// Scans pnpm-lock.yaml for package@version pairs known to be compromised
// in npm supply-chain attacks. Update COMPROMISED as new advisories land.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lockPath = path.join(rootDir, "pnpm-lock.yaml");

// keyv/cacheable namespace attack, Sept 2025:
// https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack
// https://socket.dev/blog/popular-npm-packages-in-the-keyv-and-cacheable-namespaces-compromised-in-active-supply-chain
const COMPROMISED = new Map([
  ["keyv", ["6.0.0"]],
  ["@keyv/redis", ["6.0.0"]],
  ["@keyv/sqlite", ["6.0.0"]],
  ["@keyv/mongo", ["6.0.0"]],
  ["flat-cache", ["6.1.24"]],
  ["file-entry-cache", ["11.1.6", "11.1.7"]],
  ["cacheable-request", ["13.0.20"]],
  ["cacheable", ["2.5.1"]],
  ["@cacheable/memory", ["2.2.1"]],
  ["cache-manager", ["7.2.10"]],
  ["@cacheable/node-cache", ["3.1.2"]],
  ["@cacheable/utils", ["2.5.1"]],
  ["@cacheable/net", ["2.1.1"]],
  ["ecto", ["5.0.1"]],
  ["@thiennq/docs-viewer", ["1.6.2"]],
]);

function main() {
  const lock = readFileSync(lockPath, "utf8");
  // pnpm-lock.yaml v9 keys look like: '  keyv@5.6.0:' or "  '@cacheable/utils@2.4.1':"
  const entryPattern = /^\s*'?((?:@[^/@]+\/)?[^@'\s]+)@([^':\s]+)'?:\s*$/gm;
  const hits = [];
  let match;
  while ((match = entryPattern.exec(lock)) !== null) {
    const [, name, version] = match;
    const badVersions = COMPROMISED.get(name);
    if (badVersions?.includes(version)) {
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

  console.log(`OK — no known-compromised versions found in ${path.basename(lockPath)}.`);
}

main();
