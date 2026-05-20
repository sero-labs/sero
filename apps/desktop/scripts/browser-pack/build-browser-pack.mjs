#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  BROWSER_PACK_DATE,
  BROWSER_PACK_VERSION,
  DEFAULT_BROWSER_PACK_URL_BASE,
  artifactUrl,
  artifacts,
  findArtifact,
  pins,
} from './browser-pack-config.mjs';
import { validateAgentBrowserShims, validateBrowserPack } from './smoke-browser-pack.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '../..');
const defaultOutDir = path.join(desktopRoot, 'dist/browser-pack');
const metadataPath = path.join(
  desktopRoot,
  'electron/features/workspace/runtime/browser-pack/generated-artifacts.json',
);
const WINDOWS_CMD_SHIMS = new Set(['npm', 'npx']);

if (isMainModule()) {
  main().catch((error) => {
    console.error(`browser-pack build failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const target = findArtifact(platform, arch);
  if (!target) throw new Error(`Unsupported browser pack target: ${platform}/${arch}`);
  assertCanBuildOnHost(target);

  const outDir = path.resolve(options.outDir ?? defaultOutDir);
  const urlBase = options.urlBase ?? DEFAULT_BROWSER_PACK_URL_BASE;
  const archiveDir = path.join(outDir, BROWSER_PACK_DATE);
  const metadataOutDir = path.resolve(options.metadataOut ?? archiveDir);
  const workRoot = path.join(outDir, 'work', target.key);
  const packRoot = path.join(workRoot, 'browser');
  const archivePath = path.join(archiveDir, `${target.slug}.tar.gz`);
  const sidecarPath = path.join(metadataOutDir, `${target.slug}.json`);

  console.log(`Building ${target.key} into ${archivePath}`);
  await fs.rm(workRoot, { recursive: true, force: true });
  await fs.mkdir(packRoot, { recursive: true });
  await fs.mkdir(archiveDir, { recursive: true });

  installPlaywrightBrowsers(packRoot);
  await removePlaywrightInstallLinks(packRoot);
  installAgentBrowser(packRoot, target.platform);
  await validateAgentBrowserShims({ packRoot, artifact: target });
  await validateBrowserPack({ packRoot, artifact: target });
  await createTarGz(packRoot, archivePath);
  await assertArchiveRootShape(archivePath);

  const stat = await fs.stat(archivePath);
  const sha256 = await sha256File(archivePath);
  await writeSidecar({ target, sha256, sizeBytes: stat.size, urlBase, sidecarPath });
  await writeMetadata({ target, sha256, sizeBytes: stat.size, urlBase, writeLocalUrls: options.writeLocalUrls });

  console.log(`Archive: ${archivePath}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Sidecar: ${sidecarPath}`);
  console.log(`Metadata: ${metadataPath}`);
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
    if (key === 'writeLocalUrls') {
      options.writeLocalUrls = true;
      continue;
    }
    if (!['platform', 'arch', 'outDir', 'urlBase', 'metadataOut'].includes(key)) throw new Error(`Unknown option: ${arg}`);
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/browser-pack/build-browser-pack.mjs [options]\n\nOptions:\n  --platform <platform>      Target platform (default: current host)\n  --arch <arch>              Target architecture (default: current host)\n  --out-dir <path>           Output directory (default: apps/desktop/dist/browser-pack)\n  --metadata-out <path>      Sidecar output directory (default: archive directory)\n  --url-base <url>           Sidecar URL base (default: production GitHub Release URL)\n  --write-local-urls         Deprecated no-op; generated metadata always keeps production URLs\n  -h, --help                 Show this help\n\nBuilds one current-host browser pack using pinned versions from browser-pack-config.mjs.`);
}

function assertCanBuildOnHost(target) {
  if (target.platform !== process.platform || target.arch !== process.arch) {
    throw new Error(
      `Cannot build ${target.platform}/${target.arch} on this host (${process.platform}/${process.arch}); `
        + 'Playwright browser archives are installed for the current host only.',
    );
  }
}

function installPlaywrightBrowsers(packRoot) {
  run('npx', ['-y', `playwright@${pins.playwrightVersion}`, 'install', 'chromium', 'ffmpeg'], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: packRoot },
  });
}

async function removePlaywrightInstallLinks(packRoot) {
  await fs.rm(path.join(packRoot, '.links'), { recursive: true, force: true });
}

function installAgentBrowser(packRoot, platform) {
  const agentRoot = path.join(packRoot, 'agent-browser');
  run('npm', ['install', '--prefix', agentRoot, `agent-browser@${pins.agentBrowserVersion}`]);
  materializeAgentBrowserBinSync(agentRoot, platform);
}

function materializeAgentBrowserBinSync(agentRoot, platform) {
  const packageJsonPath = path.join(agentRoot, 'node_modules/agent-browser/package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const binValue = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.['agent-browser'];
  if (!binValue) throw new Error('agent-browser package does not declare an agent-browser bin');

  const binDir = path.join(agentRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const packageBin = path.join(agentRoot, 'node_modules/agent-browser', binValue);

  if (platform === 'win32') {
    const cmdPath = path.join(binDir, 'agent-browser.cmd');
    writeFileSync(cmdPath, `@echo off\r\nnode "%~dp0..\\node_modules\\agent-browser\\${binValue.replaceAll('/', '\\')}" %*\r\n`);
    return;
  }

  const shimPath = path.join(binDir, 'agent-browser');
  writeFileSync(shimPath, `#!/usr/bin/env sh\nexec node "$(dirname "$0")/../node_modules/agent-browser/${binValue}" "$@"\n`);
  chmodSync(shimPath, 0o755);
  chmodSync(packageBin, 0o755);
}

async function createTarGz(packRoot, archivePath) {
  await fs.rm(archivePath, { force: true });
  run('tar', [...tarPathArgs(), '-czf', archivePath, '-C', packRoot, '.']);
}

async function assertArchiveRootShape(archivePath) {
  const result = run('tar', [...tarPathArgs(), '-tzf', archivePath], { capture: true });
  const entries = result.stdout.split('\n').filter(Boolean);
  if (entries.some((entry) => entry === 'browser/' || entry.startsWith('browser/'))) {
    throw new Error('Archive contains an extra top-level browser/ directory');
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function writeSidecar({ target, sha256, sizeBytes, urlBase, sidecarPath }) {
  const sidecar = {
    key: target.key,
    platform: target.platform,
    arch: target.arch,
    slug: target.slug,
    url: artifactUrl(target.slug, urlBase),
    sha256,
    sizeBytes,
    chromiumExecutableCandidates: target.chromiumExecutableCandidates,
    ffmpegCandidates: target.ffmpegCandidates,
    agentBrowserCandidates: target.agentBrowserCandidates,
  };
  await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
  await fs.writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
}

async function writeMetadata({ target, sha256, sizeBytes }) {
  const existingMetadata = await readExistingMetadata();
  const metadataUrlBase = DEFAULT_BROWSER_PACK_URL_BASE;
  const generatedArtifacts = Object.fromEntries(
    artifacts.map((artifactSpec) => {
      const existingArtifact = existingMetadata?.artifacts?.[artifactSpec.key];
      const builtMetadata = artifactSpec.key === target.key
        ? { url: artifactUrl(artifactSpec.slug, metadataUrlBase), sha256, sizeBytes }
        : currentBuiltMetadata(existingArtifact, artifactSpec.slug, metadataUrlBase);
      return [
        artifactSpec.key,
        {
          platform: artifactSpec.platform,
          arch: artifactSpec.arch,
          slug: artifactSpec.slug,
          ...(builtMetadata
            ? {
                status: 'built',
                available: true,
                url: builtMetadata.url,
                sha256: builtMetadata.sha256,
                sizeBytes: builtMetadata.sizeBytes,
              }
            : {
                status: 'pending',
                available: false,
              }),
          chromiumExecutableCandidates: artifactSpec.chromiumExecutableCandidates,
          ffmpegCandidates: artifactSpec.ffmpegCandidates,
          agentBrowserCandidates: artifactSpec.agentBrowserCandidates,
        },
      ];
    }),
  );
  const metadata = {
    version: BROWSER_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    pins,
    artifacts: generatedArtifacts,
  };
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function currentBuiltMetadata(existingArtifact, slug, urlBase) {
  if (!existingArtifact || existingArtifact.status !== 'built' || existingArtifact.available !== true) return null;
  if (!/^[a-f0-9]{64}$/.test(existingArtifact.sha256 ?? '')) return null;
  if (typeof existingArtifact.sizeBytes !== 'number' || existingArtifact.sizeBytes <= 0) return null;
  return {
    url: artifactUrl(slug, urlBase),
    sha256: existingArtifact.sha256,
    sizeBytes: existingArtifact.sizeBytes,
  };
}

async function readExistingMetadata() {
  if (!existsSync(metadataPath)) return null;
  return JSON.parse(await fs.readFile(metadataPath, 'utf8'));
}

function run(command, args, options = {}) {
  const invocation = resolveRunCommand(command);
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(invocation.command, args, {
    cwd: desktopRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: invocation.shell,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture && result.stderr ? `\n${result.stderr.trim()}` : '';
    throw new Error(`${command} exited with status ${result.status}${details}`);
  }
  return result;
}

export function resolveRunCommand(command, platform = process.platform) {
  const usesWindowsCommandShim = platform === 'win32' && WINDOWS_CMD_SHIMS.has(command);
  return {
    command: usesWindowsCommandShim ? `${command}.cmd` : command,
    shell: usesWindowsCommandShim,
  };
}

export function tarPathArgs(platform = process.platform) {
  return platform === 'win32' ? ['--force-local'] : [];
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

