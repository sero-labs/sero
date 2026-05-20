#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDesktopRoot = path.resolve(scriptDir, '..');
const defaultRepoRoot = path.resolve(defaultDesktopRoot, '../..');

const requiredPackageScripts = [
  'dist:mac',
  'dist:linux',
  'dist:linux:x64',
  'dist:linux:arm64',
  'dist:win',
  'browser-pack:verify-published',
];

const workflowRequirements = [
  { name: 'macOS arm64', targetToken: 'macos-arm64', osToken: 'macos', archToken: 'arm64', runnerLabel: 'ARM64', distScript: 'dist:mac' },
  { name: 'Linux x64', targetToken: 'linux-x64', osToken: 'linux', archToken: 'x64', runnerLabel: 'X64', distScript: 'dist:linux:x64' },
  { name: 'Linux arm64', targetToken: 'linux-arm64', osToken: 'linux', archToken: 'arm64', runnerLabel: 'ARM64', distScript: 'dist:linux:arm64' },
  { name: 'Windows x64', targetToken: 'windows-x64', osToken: 'windows', archToken: 'x64', runnerLabel: 'X64', distScript: 'dist:win' },
];

const docFilesToCheck = [
  'docs/features/host-toolchain.md',
  'docs/features/runtime-provider-architecture.md',
  'docs/reference/runtime-smoke.md',
  'docs/reference/runtime-manual-test.md',
  'docs/reference/host-mode-support.md',
  'docs/reference/manual-tests/host-first/README.md',
  'docs/reference/manual-tests/host-first/linux.md',
  'docs/reference/manual-tests/host-first/windows.md',
  'docs/reference/manual-tests/host-first/macos-apple-silicon.md',
];

const forbiddenSupportedDocPhrases = [
  'Published browser-pack install is not available for Linux',
  'Published browser-pack install is not available for Windows',
  'Linux, Windows, and Intel macOS require the local artifact smoke flow',
  'Linux, Windows, and Intel macOS host browser automation need a locally served artifact override',
  'the only published installable browser-pack artifact is macOS Apple Silicon',
  'only macOS Apple Silicon is built',
  'only macOS Apple Silicon is published',
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`host-mode release verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = await verifyHostModeRelease({
    repoRoot: options.repoRoot ?? defaultRepoRoot,
    desktopRoot: options.desktopRoot ?? defaultDesktopRoot,
    verifyPublished: options.verifyPublished === true,
  });

  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  console.log(`Host-mode release repository checks passed for ${result.requiredArtifactKeys.length} browser-pack target(s).`);
  if (!options.verifyPublished) {
    console.log('Network publication verification was not run. Run `pnpm --filter @sero/desktop browser-pack:verify-published` before release.');
  }
}

export async function verifyHostModeRelease({ repoRoot = defaultRepoRoot, desktopRoot = defaultDesktopRoot, verifyPublished = false } = {}) {
  const failures = [];
  const warnings = [];
  const matrixPath = path.join(desktopRoot, 'electron/features/workspace/runtime/host-support-matrix.json');
  const metadataPath = path.join(desktopRoot, 'electron/features/workspace/runtime/browser-pack/generated-artifacts.json');
  const packageJsonPath = path.join(desktopRoot, 'package.json');
  const workflowPath = path.join(repoRoot, '.github/workflows/host-mode-release.yml');

  const [targets, metadata, packageJson, workflowText] = await Promise.all([
    readJson(matrixPath),
    readJson(metadataPath),
    readJson(packageJsonPath),
    readOptionalText(workflowPath),
  ]);

  const requiredArtifactKeys = checkBrowserPackMetadata(targets, metadata, failures);
  checkPackageScripts(packageJson, failures);
  checkWorkflow(workflowPath, workflowText, failures);
  await checkDocs(repoRoot, failures);

  if (verifyPublished) {
    await runBrowserPackPublicationVerifier(desktopRoot, failures);
  } else {
    warnings.push('Skipped network browser-pack publication verification; run browser-pack:verify-published separately.');
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { requiredArtifactKeys, warnings };
}

function checkBrowserPackMetadata(targets, metadata, failures) {
  const requiredArtifactKeys = [];
  for (const target of targets) {
    if (!target.releaseSupported || !target.browserPackRequired) continue;
    const key = `browser-${target.platform}-${target.arch}`;
    requiredArtifactKeys.push(key);
    const artifact = metadata?.artifacts?.[key];
    if (!artifact || artifact.status !== 'built' || artifact.available !== true) {
      failures.push(`Missing built/available browser-pack artifact in committed metadata: ${key}`);
      continue;
    }
    if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
      failures.push(`${key} has invalid sha256 in committed metadata`);
    }
    if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
      failures.push(`${key} has invalid sizeBytes in committed metadata`);
    }
    if (typeof artifact.url !== 'string' || !artifact.url.startsWith('https://github.com/sero-labs/sero/releases/download/')) {
      failures.push(`${key} must use a GitHub Release browser-pack URL in committed metadata`);
    }
  }
  return requiredArtifactKeys;
}

function checkPackageScripts(packageJson, failures) {
  for (const script of requiredPackageScripts) {
    if (typeof packageJson?.scripts?.[script] !== 'string' || packageJson.scripts[script].trim() === '') {
      failures.push(`apps/desktop/package.json: Missing package script: ${script}`);
    }
  }
}

function checkWorkflow(workflowPath, workflowText, failures) {
  if (workflowText === undefined) {
    failures.push(`${relativePath(workflowPath)}: missing host-mode release workflow`);
    return;
  }

  for (const requirement of workflowRequirements) {
    if (!workflowText.includes(`target: ${requirement.targetToken}`) && !workflowText.includes(`target: '${requirement.targetToken}'`) && !workflowText.includes(`target: "${requirement.targetToken}"`)) {
      failures.push(`${relativePath(workflowPath)}: missing ${requirement.name} release job/matrix entry`);
    }
    if (!workflowText.includes(`os: ${requirement.osToken}`) && !workflowText.includes(`os: '${requirement.osToken}'`) && !workflowText.includes(`os: "${requirement.osToken}"`)) {
      failures.push(`${relativePath(workflowPath)}: missing ${requirement.name} OS marker: ${requirement.osToken}`);
    }
    if (!workflowText.includes(`arch: ${requirement.archToken}`) && !workflowText.includes(`arch: '${requirement.archToken}'`) && !workflowText.includes(`arch: "${requirement.archToken}"`)) {
      failures.push(`${relativePath(workflowPath)}: missing ${requirement.name} architecture marker: ${requirement.archToken}`);
    }
    if (!workflowText.includes(requirement.runnerLabel)) {
      failures.push(`${relativePath(workflowPath)}: missing ${requirement.name} runner label: ${requirement.runnerLabel}`);
    }
    if (!workflowText.includes(requirement.distScript)) {
      failures.push(`${relativePath(workflowPath)}: missing ${requirement.name} packaging script: ${requirement.distScript}`);
    }
  }

  if (!workflowText.includes('browser-pack:verify-published')) {
    failures.push(`${relativePath(workflowPath)}: missing browser-pack:verify-published release gate`);
  }
  if (!workflowText.includes('runtime-host-release.workflow.spec.ts')) {
    failures.push(`${relativePath(workflowPath)}: missing host release smoke workflow spec`);
  }
}

async function checkDocs(repoRoot, failures) {
  for (const relativeDocPath of docFilesToCheck) {
    const fullPath = path.join(repoRoot, relativeDocPath);
    const text = await readOptionalText(fullPath);
    if (text === undefined) continue;
    for (const phrase of forbiddenSupportedDocPhrases) {
      if (text.includes(phrase)) failures.push(`${relativeDocPath}: stale supported-platform browser-pack wording: "${phrase}"`);
    }
  }
}

async function runBrowserPackPublicationVerifier(desktopRoot, failures) {
  try {
    await execFileAsync('pnpm', ['--filter', '@sero/desktop', 'browser-pack:verify-published'], {
      cwd: path.resolve(desktopRoot, '../..'),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (error) {
    failures.push(`browser-pack publication verifier failed: ${errorOutput(error)}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalText(filePath) {
  if (!(await fileExists(filePath))) return undefined;
  return fs.readFile(filePath, 'utf8');
}

async function fileExists(filePath) {
  const stats = await fs.stat(filePath).catch((error) => {
    if (error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  return stats?.isFile() === true;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--verify-published') {
      options.verifyPublished = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (key !== 'repoRoot' && key !== 'desktopRoot') throw new Error(`Unknown option: ${arg}`);
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return options;
}

function printHelp() {
  console.log('Usage: node scripts/verify-host-mode-release.mjs [--verify-published] [--repo-root <path>] [--desktop-root <path>]');
}

function errorOutput(error) {
  if (!error || typeof error !== 'object') return String(error);
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : '';
  const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : '';
  const message = error instanceof Error ? error.message : String(error);
  return [stderr, stdout, message].filter(Boolean).join('\n');
}

function relativePath(filePath) {
  return path.relative(process.cwd(), filePath) || filePath;
}
