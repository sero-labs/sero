#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BROWSER_PACK_VERSION } from './browser-pack-config.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '../..');
const defaultMetadataPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/browser-pack/generated-artifacts.json',
);
const hostReleaseMatrixPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/host-support-matrix.json',
);
const productionUrlPrefix = `https://github.com/sero-labs/sero/releases/download/${BROWSER_PACK_VERSION}/`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`browser-pack publication verification failed: ${error.message}`);
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
  const result = await verifyBrowserPackPublication({ targets, metadata });
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  console.log(`Verified ${result.verifiedKeys.length} published browser-pack artifact(s).`);
}

export async function verifyBrowserPackPublication({ targets, metadata, downloadArtifact = fetchArtifactBytes }) {
  const failures = [];
  const warnings = [];
  const verifiedKeys = [];

  for (const target of targets) {
    const key = artifactKey(target);
    const artifact = metadata?.artifacts?.[key];
    if (!target.releaseSupported || !target.browserPackRequired) {
      if (artifact?.status === 'pending') warnings.push(`${key} is explicitly unsupported/future and remains pending`);
      continue;
    }

    const artifactFailures = validateArtifactMetadata(key, artifact);
    if (artifactFailures.length > 0) {
      failures.push(...artifactFailures);
      continue;
    }

    try {
      const bytes = await downloadArtifact(artifact.url, key);
      const actualSize = byteLength(bytes);
      const actualSha = createHash('sha256').update(bytes).digest('hex');
      if (actualSize !== artifact.sizeBytes) {
        failures.push(`${key} downloaded size ${actualSize} does not match metadata size ${artifact.sizeBytes}`);
      }
      if (actualSha !== artifact.sha256) {
        failures.push(`${key} sha256 mismatch: expected ${artifact.sha256}, got ${actualSha}`);
      }
      if (actualSize === artifact.sizeBytes && actualSha === artifact.sha256) verifiedKeys.push(key);
    } catch (error) {
      failures.push(`${key} download failed from ${artifact.url}: ${errorMessage(error)}`);
    }
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { verifiedKeys, warnings };
}

function validateArtifactMetadata(key, artifact) {
  const failures = [];
  if (!artifact || artifact.status !== 'built' || artifact.available !== true) {
    return [`${key} is required for release but is not built/available`];
  }
  if (typeof artifact.url !== 'string' || !artifact.url.startsWith(productionUrlPrefix)) {
    failures.push(`${key} must use the ${BROWSER_PACK_VERSION} GitHub Release asset URL`);
  }
  if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    failures.push(`${key} has invalid sha256`);
  }
  if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
    failures.push(`${key} has invalid sizeBytes`);
  }
  return failures;
}

async function fetchArtifactBytes(url, key) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') throw new Error('HTTP response has zero content-length');
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

function artifactKey(target) {
  return `browser-${target.platform}-${target.arch}`;
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
  console.log('Usage: node scripts/browser-pack/verify-browser-pack-publication.mjs [--metadata <path>]');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
