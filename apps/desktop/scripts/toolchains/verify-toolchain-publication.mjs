#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '../..');
const defaultMetadataPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/toolchains/generated-artifacts.json',
);
const hostReleaseMatrixPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/host-support-matrix.json',
);
const coreTools = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`toolchain publication verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const [targets, metadata] = await Promise.all([
    readJson(hostReleaseMatrixPath),
    readJson(options.metadata ?? defaultMetadataPath),
  ]);
  const result = await verifyToolchainPublication({ targets, metadata });
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  console.log(`Verified ${result.verifiedKeys.length} published core toolchain artifact(s).`);
}

export async function verifyToolchainPublication({ targets, metadata, downloadArtifact = fetchArtifactBytes }) {
  const failures = [];
  const warnings = [];
  const verifiedKeys = [];
  const releaseTag = releaseTagFor(metadata);
  const productionUrlPrefix = `https://github.com/sero-labs/sero/releases/download/${releaseTag}/`;

  for (const target of targets) {
    for (const tool of coreTools) {
      const key = artifactKey(metadata, target, tool);
      const artifact = key ? metadata?.artifacts?.[key] : undefined;
      if (!target.releaseSupported) {
        if (artifact?.status === 'pending') warnings.push(`${tool}-${target.platform}-${target.arch} is unsupported/future and remains pending`);
        continue;
      }

      const artifactFailures = validateArtifactMetadata({ key: key ?? `${tool}-${target.platform}-${target.arch}`, artifact, productionUrlPrefix, releaseTag });
      if (artifactFailures.length > 0) {
        failures.push(...artifactFailures);
        continue;
      }

      try {
        const bytes = await downloadArtifact(artifact.url, key);
        const actualSize = byteLength(bytes);
        const actualSha = createHash('sha256').update(bytes).digest('hex');
        if (Number.isInteger(artifact.sizeBytes) && actualSize !== artifact.sizeBytes) {
          failures.push(`${key} downloaded size ${actualSize} does not match metadata size ${artifact.sizeBytes}`);
        }
        if (actualSha !== artifact.sha256) {
          failures.push(`${key} sha256 mismatch: expected ${artifact.sha256}, got ${actualSha}`);
        }
        if (actualSha === artifact.sha256 && (!Number.isInteger(artifact.sizeBytes) || actualSize === artifact.sizeBytes)) {
          verifiedKeys.push(key);
        }
      } catch (error) {
        failures.push(`${key} download failed from ${artifact.url}: ${errorMessage(error)}`);
      }
    }
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { verifiedKeys, warnings };
}

function validateArtifactMetadata({ key, artifact, productionUrlPrefix, releaseTag }) {
  const failures = [];
  if (!artifact || artifact.status !== 'built' || artifact.available !== true) {
    return [`${key} is required for release but is not built/available`];
  }
  if (typeof artifact.url !== 'string' || !artifact.url.startsWith(productionUrlPrefix)) {
    failures.push(`${key} must use the ${releaseTag} GitHub Release asset URL`);
  }
  if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    failures.push(`${key} has invalid sha256`);
  }
  if (artifact.sizeBytes !== undefined && (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0)) {
    failures.push(`${key} has invalid sizeBytes`);
  }
  return failures;
}

async function fetchArtifactBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0) throw new Error('downloaded artifact is empty');
  return body;
}

function byteLength(bytes) {
  if (bytes instanceof Uint8Array) return bytes.byteLength;
  if (Buffer.isBuffer(bytes)) return bytes.byteLength;
  if (typeof bytes === 'string') return Buffer.byteLength(bytes);
  throw new Error('download helper returned unsupported bytes');
}

function artifactKey(metadata, target, tool) {
  return Object.entries(metadata?.artifacts ?? {}).find(([, artifact]) => (
    artifact.tool === tool && artifact.platform === target.platform && artifact.arch === target.arch
  ))?.[0];
}

function releaseTagFor(metadata) {
  const tag = metadata?.releaseTag;
  if (typeof tag !== 'string' || tag.length === 0) throw new Error('toolchain metadata is missing releaseTag');
  return tag;
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
    if (key !== 'metadata') throw new Error(`Unknown option: ${arg}`);
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return options;
}

function printHelp() {
  console.log('Usage: node scripts/toolchains/verify-toolchain-publication.mjs [--metadata <path>]');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
