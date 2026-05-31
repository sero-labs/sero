#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '../..');
const defaultMetadataPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/toolchains/generated-artifacts.json',
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`toolchain metadata merge failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  await mergeToolchainMetadata({
    sidecarDir: options.sidecarDir,
    out: options.out ?? defaultMetadataPath,
    metadataPath: options.metadata ?? defaultMetadataPath,
    releaseTag: options.releaseTag,
    version: options.version,
  });
}

export async function mergeToolchainMetadata({ sidecarDir, out = defaultMetadataPath, metadataPath = defaultMetadataPath, releaseTag, version }) {
  if (!sidecarDir) throw new Error('Missing --sidecar-dir');
  if (!releaseTag) throw new Error('Missing --release-tag');
  if (!version) throw new Error('Missing --version');

  const base = await readJson(metadataPath);
  const sidecars = await readSidecars(sidecarDir);
  const artifacts = Object.fromEntries(
    Object.entries(base.artifacts ?? {}).map(([key, artifact]) => [
      key,
      mergeArtifact(key, artifact, sidecars.get(key), releaseTag),
    ]),
  );

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify({ version, releaseTag, artifacts }, null, 2)}\n`);
}

async function readSidecars(sidecarDir) {
  const entries = await fs.readdir(sidecarDir, { withFileTypes: true }).catch((error) => {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  });
  const sidecars = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(sidecarDir, entry.name);
    const sidecar = await readJson(filePath);
    validateSidecar(sidecar, filePath);
    if (sidecars.has(sidecar.key)) throw new Error(`Duplicate sidecar for ${sidecar.key}`);
    sidecars.set(sidecar.key, sidecar);
  }
  return sidecars;
}

function mergeArtifact(key, artifact, sidecar, releaseTag) {
  const base = {
    tool: artifact.tool,
    platform: artifact.platform,
    arch: artifact.arch,
    slug: artifact.slug,
    unpackTo: artifact.unpackTo,
    binPaths: artifact.binPaths,
    minVersion: artifact.minVersion,
    installPolicy: artifact.installPolicy,
  };
  if (!sidecar) return { ...base, status: 'pending', available: false };
  validateSidecarMatchesArtifact(sidecar, key, artifact, releaseTag);
  return {
    ...base,
    status: 'built',
    available: true,
    url: sidecar.url,
    sha256: sidecar.sha256,
  };
}

function validateSidecar(sidecar, filePath) {
  if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) {
    throw new Error(`${filePath} must contain a sidecar object`);
  }
  for (const field of ['key', 'tool', 'platform', 'arch', 'slug', 'url', 'sha256']) {
    if (typeof sidecar[field] !== 'string' || sidecar[field].length === 0) {
      throw new Error(`${filePath} has invalid ${field}`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(sidecar.sha256)) throw new Error(`${sidecar.key} has invalid sha256`);
}

function validateSidecarMatchesArtifact(sidecar, key, artifact, releaseTag) {
  for (const field of ['tool', 'platform', 'arch', 'slug']) {
    if (sidecar[field] !== artifact[field]) throw new Error(`${key} ${field} does not match existing toolchain metadata`);
  }
  if (sidecar.key !== key) throw new Error(`${sidecar.key} key does not match existing toolchain metadata`);
  const expectedUrl = `https://github.com/sero-labs/sero/releases/download/${releaseTag}/${artifact.slug}.tar.gz`;
  if (sidecar.url !== expectedUrl) throw new Error(`${key} URL must be ${expectedUrl}`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (!['sidecarDir', 'out', 'metadata', 'releaseTag', 'version'].includes(key)) throw new Error(`Unknown option: ${arg}`);
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return options;
}

function printHelp() {
  console.log('Usage: node scripts/toolchains/merge-toolchain-metadata.mjs --sidecar-dir <path> --release-tag <tag> --version <version> [--metadata <path>] [--out <path>]');
}
