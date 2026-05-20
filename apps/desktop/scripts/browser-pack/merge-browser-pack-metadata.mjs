#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_PACK_DATE,
  BROWSER_PACK_VERSION,
  DEFAULT_BROWSER_PACK_URL_BASE,
  artifactUrl,
  artifacts,
  pins,
} from './browser-pack-config.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '../..');
const defaultSidecarDir = path.join(desktopRoot, 'dist/browser-pack', BROWSER_PACK_DATE);
const defaultMetadataPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/browser-pack/generated-artifacts.json',
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`browser-pack metadata merge failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await mergeBrowserPackMetadata({
    sidecarDir: options.sidecarDir ?? defaultSidecarDir,
    out: options.out ?? defaultMetadataPath,
    urlBase: options.urlBase ?? DEFAULT_BROWSER_PACK_URL_BASE,
  });
}

export async function mergeBrowserPackMetadata({ sidecarDir, out, urlBase = DEFAULT_BROWSER_PACK_URL_BASE }) {
  assertProductionUrlBase(urlBase);
  const sidecars = await readSidecars(sidecarDir);
  const generatedArtifacts = Object.fromEntries(
    artifacts.map((artifactSpec) => {
      const sidecar = sidecars.get(artifactSpec.key);
      return [artifactSpec.key, createArtifactMetadata(artifactSpec, sidecar, urlBase)];
    }),
  );
  const metadata = {
    version: BROWSER_PACK_VERSION,
    generatedAt: `${BROWSER_PACK_DATE}T00:00:00.000Z`,
    pins,
    artifacts: generatedArtifacts,
  };
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(metadata, null, 2)}\n`);
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
    if (!['sidecarDir', 'out', 'urlBase'].includes(key)) throw new Error(`Unknown option: ${arg}`);
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/browser-pack/merge-browser-pack-metadata.mjs [options]\n\nOptions:\n  --sidecar-dir <path>  Directory containing <slug>.json sidecars (default: dist/browser-pack/${BROWSER_PACK_DATE})\n  --out <path>          Output generated-artifacts.json path\n  --url-base <url>      GitHub Release browser-pack URL base\n  -h, --help            Show this help`);
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
    const sidecar = JSON.parse(await fs.readFile(filePath, 'utf8'));
    validateSidecar(sidecar, filePath);
    if (sidecars.has(sidecar.key)) throw new Error(`Duplicate sidecar for ${sidecar.key}`);
    sidecars.set(sidecar.key, sidecar);
  }
  return sidecars;
}

function createArtifactMetadata(artifactSpec, sidecar, urlBase) {
  const baseFields = {
    platform: artifactSpec.platform,
    arch: artifactSpec.arch,
    slug: artifactSpec.slug,
  };
  const candidates = {
    chromiumExecutableCandidates: artifactSpec.chromiumExecutableCandidates,
    ffmpegCandidates: artifactSpec.ffmpegCandidates,
    agentBrowserCandidates: artifactSpec.agentBrowserCandidates,
  };
  if (!sidecar) {
    return {
      ...baseFields,
      status: 'pending',
      available: false,
      ...candidates,
    };
  }
  validateSidecarMatchesArtifact(sidecar, artifactSpec, urlBase);
  return {
    ...baseFields,
    status: 'built',
    available: true,
    url: artifactUrl(artifactSpec.slug, urlBase),
    sha256: sidecar.sha256,
    sizeBytes: sidecar.sizeBytes,
    ...candidates,
  };
}

function validateSidecar(sidecar, filePath) {
  if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) {
    throw new Error(`${filePath} must contain a sidecar object`);
  }
  for (const field of ['key', 'platform', 'arch', 'slug', 'url', 'sha256']) {
    if (typeof sidecar[field] !== 'string' || sidecar[field].length === 0) {
      throw new Error(`${filePath} has invalid ${field}`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(sidecar.sha256)) throw new Error(`${sidecar.key} has invalid sha256`);
  if (!Number.isInteger(sidecar.sizeBytes) || sidecar.sizeBytes <= 0) {
    throw new Error(`${sidecar.key} has invalid sizeBytes`);
  }
}

function validateSidecarMatchesArtifact(sidecar, artifactSpec, urlBase) {
  for (const field of ['key', 'platform', 'arch', 'slug']) {
    if (sidecar[field] !== artifactSpec[field]) {
      throw new Error(`${sidecar.key} ${field} does not match browser-pack-config.mjs`);
    }
  }
  const expectedUrl = artifactUrl(artifactSpec.slug, urlBase);
  if (sidecar.url !== expectedUrl) throw new Error(`${sidecar.key} URL must be ${expectedUrl}`);
}

function assertProductionUrlBase(urlBase) {
  const expectedPrefix = `https://github.com/sero-labs/sero/releases/download/${BROWSER_PACK_VERSION}`;
  if (urlBase.replace(/\/$/, '') !== expectedPrefix) {
    throw new Error(`Browser-pack metadata must use production GitHub Release URL base: ${expectedPrefix}`);
  }
}
