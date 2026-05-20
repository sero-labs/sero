#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findArtifact } from './browser-pack-config.mjs';

const WINDOWS_EXECUTABLE_EXTENSIONS = new Set(['.cmd', '.exe', '.bat', '.com']);
const AGENT_BROWSER_PACKAGE_PATH_PATTERN = /node_modules[\\/]agent-browser[\\/]([^"'\s%]+)/;

if (isMainModule()) {
  main().catch((error) => {
    console.error(`browser-pack smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.packRoot) throw new Error('Missing required --pack-root <path>');

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const artifact = findArtifact(platform, arch);
  if (!artifact) throw new Error(`Unsupported browser pack target: ${platform}/${arch}`);

  await validateBrowserPack({ packRoot: options.packRoot, artifact });
}

export async function validateBrowserPack({ packRoot, artifact, log = console.log }) {
  const root = path.resolve(packRoot);
  await assertDirectory(root);

  const checks = [
    { name: 'Chromium', candidates: artifact.chromiumExecutableCandidates },
    { name: 'ffmpeg', candidates: artifact.ffmpegCandidates },
    { name: 'agent-browser', candidates: artifact.agentBrowserCandidates },
  ];

  const failures = [];
  for (const check of checks) {
    const executable = await firstExecutable(root, check.candidates, artifact.platform);
    if (executable) {
      log(`${check.name}: ${path.relative(root, executable)}`);
    } else {
      failures.push(formatMissingExecutable(root, check, artifact.platform));
    }
  }

  try {
    await validateAgentBrowserShims({ packRoot: root, artifact, log });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    throw new Error(`Browser pack smoke validation failed for ${artifact.key}:\n${failures.join('\n')}`);
  }

  log(`Browser pack smoke passed for ${artifact.key}`);
}

export async function validateAgentBrowserShims({ packRoot, artifact, log = console.log }) {
  const root = path.resolve(packRoot);
  const failures = [];
  for (const candidate of artifact.agentBrowserCandidates) {
    const shimPath = path.join(root, candidate);
    if (!await fileExists(shimPath)) continue;
    try {
      await validateAgentBrowserShim(root, candidate, artifact.platform);
      log(`agent-browser shim: ${candidate}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
}

async function assertDirectory(packRoot) {
  let stat;
  try {
    stat = await fs.stat(packRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Pack root does not exist: ${packRoot}`);
    throw error;
  }
  if (!stat.isDirectory()) throw new Error(`Pack root is not a directory: ${packRoot}`);
}

async function firstExecutable(packRoot, candidates, platform) {
  for (const candidate of candidates) {
    const fullPath = path.join(packRoot, candidate);
    if (await isExecutable(fullPath, platform)) return fullPath;
  }
  return null;
}

async function isExecutable(filePath, platform) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    if (platform === 'win32') return isWindowsExecutableCandidate(filePath);
    return (stat.mode & 0o111) !== 0;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function isWindowsExecutableCandidate(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return WINDOWS_EXECUTABLE_EXTENSIONS.has(extension) || extension === '';
}

async function validateAgentBrowserShim(packRoot, candidate, platform) {
  const shimPath = path.join(packRoot, candidate);
  const shim = await fs.readFile(shimPath, 'utf8');
  const targetMatch = shim.match(AGENT_BROWSER_PACKAGE_PATH_PATTERN);
  if (!targetMatch?.[1]) {
    throw new Error(`agent-browser shim does not reference package bin: ${candidate}`);
  }

  if (platform === 'win32' && !WINDOWS_EXECUTABLE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) {
    throw new Error(`agent-browser Windows shim must use an executable extension: ${candidate}`);
  }

  const packageBin = path.join(packRoot, 'agent-browser/node_modules/agent-browser', normalizePackageBin(targetMatch[1]));
  const stat = await statFile(packageBin);
  if (!stat?.isFile()) throw new Error(`agent-browser shim target is missing: ${packageBin}`);
  if (platform !== 'win32' && (stat.mode & 0o111) === 0) {
    throw new Error(`agent-browser shim target is not executable: ${packageBin}`);
  }
}

function normalizePackageBin(packageBin) {
  return packageBin.replaceAll('\\\\', '/').replaceAll('\\', '/');
}

async function fileExists(filePath) {
  return Boolean(await statFile(filePath));
}

async function statFile(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function formatMissingExecutable(packRoot, check, platform) {
  const requirement = platform === 'win32' ? 'an executable file' : 'a file with executable permissions';
  const checked = check.candidates.map((candidate) => `  - ${path.join(packRoot, candidate)}`).join('\n');
  return `${check.name} missing or not executable (${requirement}); checked:\n${checked}`;
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
    if (!['packRoot', 'platform', 'arch'].includes(key)) throw new Error(`Unknown option: ${arg}`);
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/browser-pack/smoke-browser-pack.mjs --pack-root <path> [options]\n\nOptions:\n  --pack-root <path>    Staged or unpacked browser pack root to validate\n  --platform <platform> Target platform (default: current host)\n  --arch <arch>         Target architecture (default: current host)\n  -h, --help            Show this help\n\nValidates Chromium, ffmpeg, and agent-browser candidate executables from browser-pack-config.mjs.`);
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
