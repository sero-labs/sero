#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

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
const macosSystemCoreTools = new Set(['git', 'ssh', 'bash']);

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
    for (const tool of requiredCoreToolsForTarget(target)) {
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
        const actualSha = createHash('sha256').update(bytes).digest('hex');
        if (actualSha !== artifact.sha256) {
          failures.push(`${key} sha256 mismatch: expected ${artifact.sha256}, got ${actualSha}`);
        }
        try {
          assertSafeTarGz(bytes, key);
        } catch (error) {
          failures.push(`${key} archive is unsafe: ${errorMessage(error)}`);
        }
        if (actualSha === artifact.sha256) verifiedKeys.push(key);
      } catch (error) {
        failures.push(`${key} download failed from ${artifact.url}: ${errorMessage(error)}`);
      }
    }
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { verifiedKeys, warnings };
}

function requiredCoreToolsForTarget(target) {
  if (target.platform === 'darwin') return coreTools.filter((tool) => !macosSystemCoreTools.has(tool));
  return coreTools;
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
  return failures;
}

function assertSafeTarGz(bytes, key) {
  const tar = gunzipSync(bytes);
  let offset = 0;
  let sawEnd = false;
  let nextLongLink = null;
  let nextPaxLink = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      sawEnd = true;
      break;
    }
    const type = readTarString(header, 156, 1) || '0';
    const size = readTarOctal(header, 124, 12);
    const linkName = nextPaxLink ?? nextLongLink ?? readTarString(header, 157, 100);
    nextPaxLink = null;
    nextLongLink = null;
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('entry exceeds archive length');
    if (type === '1') throw new Error('hardlinks are not supported by the runtime unpacker');
    if (type === '2') validateTarLinkName(linkName);
    if (type === 'K') nextLongLink = readTarPayloadString(tar.subarray(dataStart, dataEnd));
    if (type === 'x') nextPaxLink = parsePaxLinkpath(tar.subarray(dataStart, dataEnd));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  if (!sawEnd) throw new Error(`${key} is missing tar end-of-archive marker`);
}

function validateTarLinkName(linkName) {
  if (!linkName || linkName.includes('\0') || linkName.includes('\\')) throw new Error(`unsafe symlink target ${linkName}`);
  if (/^[A-Za-z]:/.test(linkName) || path.posix.isAbsolute(linkName)) throw new Error(`unsafe symlink target ${linkName}`);
  const normalized = path.posix.normalize(linkName);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`unsafe symlink target ${linkName}`);
  }
}

function parsePaxLinkpath(data) {
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(32, offset);
    if (space === -1) return null;
    const length = Number.parseInt(data.subarray(offset, space).toString('utf8'), 10);
    if (!Number.isFinite(length) || length <= 0) return null;
    const record = data.subarray(space + 1, offset + length).toString('utf8').replace(/\n$/, '');
    const equals = record.indexOf('=');
    if (record.slice(0, equals) === 'linkpath') return record.slice(equals + 1);
    offset += length;
  }
  return null;
}

function readTarPayloadString(data) {
  const end = data.indexOf(0);
  return data.subarray(0, end === -1 ? data.length : end).toString('utf8').trim();
}

function readTarString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8').trim();
}

function readTarOctal(buffer, offset, length) {
  const value = readTarString(buffer, offset, length).replace(/\0/g, '').trim();
  return value ? Number.parseInt(value, 8) : 0;
}

async function fetchArtifactBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0) throw new Error('downloaded artifact is empty');
  return body;
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
