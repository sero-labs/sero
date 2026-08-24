#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  applyObservationWindow,
  compareVersions,
  discoverRuntimeUpdates,
  isRoutineUpdate,
  isStableVersion,
  renderRuntimeUpdateReport,
} from './runtime-tool-sources.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '../..');
const pinsPath = path.join(desktopRoot, 'runtime-tools/pins.json');
const packagePath = path.join(desktopRoot, 'runtime-tools/package.json');
const lockPath = path.join(desktopRoot, 'runtime-tools/package-lock.json');
const dockerfilePath = path.join(desktopRoot, 'images/Dockerfile.sero-node');
const browserConfigPath = path.join(desktopRoot, 'scripts/browser-pack/browser-pack-config.mjs');
const browserWorkflowPath = path.resolve(desktopRoot, '../../.github/workflows/browser-pack-artifacts.yml');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`runtime tool update failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pins = await readJson(pinsPath);
  await validateRuntimePins({ pins, now: new Date() });
  if (options.auditBaseline || options.auditCandidate) {
    if (!options.auditBaseline || !options.auditCandidate) {
      throw new Error('Both --audit-baseline and --audit-candidate are required');
    }
    assertNoAuditRegression(
      await readJson(path.resolve(options.auditBaseline)),
      await readJson(path.resolve(options.auditCandidate)),
    );
    console.log('Runtime dependency audit has no severity regression.');
    return;
  }
  if (!options.write) {
    if (!options.report && !options.candidates) {
      console.log(`Validated ${Object.keys(pins.npm).length} locked npm runtime tools.`);
      return;
    }
  }

  if (options.securityOverrideReason !== undefined && options.securityOverrideReason.trim().length < 10) {
    throw new Error('An urgent-security override reason must contain at least 10 characters');
  }
  const now = new Date();
  const candidates = await discoverRuntimeUpdates(pins, now);
  let observations;
  if (options.observationsIn || options.observationsOut) {
    if (!options.observationsIn || !options.observationsOut) {
      throw new Error('Both --observations-in and --observations-out are required');
    }
    observations = await readJson(path.resolve(options.observationsIn));
    const nextObservations = applyObservationWindow(
      candidates,
      observations,
      now,
      pins.policy.minimumReleaseAgeDays,
    );
    await writeJson(path.resolve(options.observationsOut), nextObservations);
  } else if (options.write) {
    throw new Error('Updates require persistent first-seen observations');
  }
  if (options.report) {
    await fs.writeFile(path.resolve(options.report), `${renderRuntimeUpdateReport(pins, candidates, now)}\n`);
  }
  if (options.candidates) await writeJson(path.resolve(options.candidates), candidates);
  if (!options.write) return;

  const mode = options.breaking ? 'breaking' : 'routine';
  const updates = candidates.filter((candidate) => (
    candidate.mode === mode
    && (candidate.eligible || options.securityOverrideReason !== undefined)
    && (!options.only || candidate.key === options.only)
  ));
  const heldUpdates = candidates.filter((candidate) => candidate.mode === 'breaking');
  if (updates.length === 0) {
    console.log(`No eligible ${mode} packaged runtime updates.`);
    reportHeldUpdates(heldUpdates);
    return;
  }
  await applyRuntimeUpdates(pins, updates, options.securityOverrideReason);
  console.log(`Updated: ${updates.map(({ label, version }) => `${label}@${version}`).join(', ')}`);
  reportHeldUpdates(heldUpdates);
}

function reportHeldUpdates(updates) {
  if (updates.length === 0) return;
  console.log(`Breaking-update draft PR candidates: ${updates.map(({ label, version }) => `${label}@${version}`).join(', ')}`);
}

export function isReleaseEligible(releasedAt, now, minimumReleaseAgeDays) {
  const released = Date.parse(releasedAt);
  if (!Number.isFinite(released)) throw new Error(`Invalid release date: ${releasedAt}`);
  return now.getTime() - released >= minimumReleaseAgeDays * 86_400_000;
}

export function assertNoAuditRegression(baseline, candidate) {
  const before = auditCounts(baseline);
  const after = auditCounts(candidate);
  const thresholds = [
    ['critical', ['critical']],
    ['high', ['critical', 'high']],
    ['moderate', ['critical', 'high', 'moderate']],
    ['total', ['critical', 'high', 'moderate', 'low', 'info']],
  ];
  for (const [label, severities] of thresholds) {
    const beforeCount = severities.reduce((total, severity) => total + before[severity], 0);
    const afterCount = severities.reduce((total, severity) => total + after[severity], 0);
    if (afterCount > beforeCount) {
      throw new Error(`Runtime dependency audit regressed at ${label}: ${beforeCount} -> ${afterCount}`);
    }
  }
}

function auditCounts(report) {
  const counts = report.metadata?.vulnerabilities;
  if (!counts) throw new Error('Runtime dependency audit report has no vulnerability counts');
  return Object.fromEntries(['critical', 'high', 'moderate', 'low', 'info'].map((severity) => (
    [severity, Number(counts[severity] ?? 0)]
  )));
}

export async function validateRuntimePins({ pins, now = new Date(), allowYoungPins = false }) {
  if (pins.policy?.minimumReleaseAgeDays !== 7) throw new Error('Runtime tools must wait exactly seven days');
  const packageJson = await readJson(packagePath);
  const lock = await readJson(lockPath);
  for (const [name, pin] of Object.entries(pins.npm ?? {})) {
    if (packageJson.dependencies?.[name] !== pin.version) throw new Error(`${name} package input is not exactly ${pin.version}`);
    const locked = lock.packages?.[`node_modules/${name}`];
    if (locked?.version !== pin.version || locked?.integrity !== pin.integrity) {
      throw new Error(`${name} lock version or integrity does not match pins.json`);
    }
    if (!allowYoungPins && !isReleaseEligible(pin.releasedAt, now, 7) && !hasRecordedOverride(pins, name, pin.version)) {
      throw new Error(`${name}@${pin.version} is younger than seven days and has no recorded security override`);
    }
  }
  for (const [name, releasedAt] of Object.entries(pins.containerReleasedAt ?? {})) {
    const override = containerOverrideIdentity(pins, name);
    if (!allowYoungPins && !isReleaseEligible(releasedAt, now, 7) && !hasRecordedOverride(pins, override.tool, override.version)) {
      throw new Error(`${name} is younger than seven days and has no recorded security override`);
    }
  }
  for (const [name, pin] of Object.entries(pins.hostTools ?? {})) {
    if (!allowYoungPins && !isReleaseEligible(pin.releasedAt, now, 7) && !hasRecordedOverride(pins, name, pin.version)) {
      throw new Error(`${name}@${pin.version} is younger than seven days and has no recorded security override`);
    }
  }
  const dockerfile = await fs.readFile(dockerfilePath, 'utf8');
  for (const expected of [
    pins.container.golangImage,
    pins.container.ubuntuImage,
    pins.container.nodeVersion,
    pins.container.githubCliVersion,
    ...Object.values(pins.container.nodeSha256),
  ]) {
    if (!dockerfile.includes(expected)) throw new Error(`Dockerfile does not consume exact pin ${expected}`);
  }
}

function containerOverrideIdentity(pins, name) {
  const identities = {
    golangImage: { tool: 'golang-image', version: pins.containerPolicy.golang.version },
    ubuntuImage: { tool: 'ubuntu-image', version: pins.container.ubuntuImage },
    nodeVersion: { tool: 'node', version: pins.container.nodeVersion },
    githubCliVersion: { tool: 'github-cli', version: pins.container.githubCliVersion },
  };
  return identities[name] ?? { tool: name, version: pins.container[name] };
}

export function selectEligibleNpmRelease({
  metadata,
  currentVersion,
  now,
  minimumReleaseAgeDays,
  allowYoung = false,
  routineUpdates = 'minor',
  updateMode = 'routine',
}) {
  return Object.keys(metadata.versions ?? {})
    .filter((version) => isStableVersion(version) && compareVersions(version, currentVersion) > 0)
    .filter((version) => isRoutineUpdate(currentVersion, version, routineUpdates) === (updateMode === 'routine'))
    .filter((version) => !metadata.versions[version]?.deprecated)
    .filter((version) => {
      const releasedAt = metadata.time?.[version];
      return releasedAt && (allowYoung || isReleaseEligible(releasedAt, now, minimumReleaseAgeDays));
    })
    .sort(compareVersions)
    .at(-1);
}

async function applyRuntimeUpdates(pins, updates, securityOverrideReason) {
  const npmUpdates = updates.filter(({ source }) => source === 'npm');
  const externalUpdates = updates.filter(({ source }) => source !== 'npm');
  if (npmUpdates.length) await applyNpmUpdates(pins, npmUpdates);
  if (externalUpdates.length) await applyExternalUpdates(pins, externalUpdates);
  for (const update of updates) {
    if (securityOverrideReason) {
      pins.securityOverrides.push({ tool: update.key, version: update.version, reason: securityOverrideReason });
    }
  }
  await updatePlaywrightBrowserPins(pins);
  await writeJson(pinsPath, pins);
  if (updates.some(({ key }) => pins.npm[key]?.usedBy.includes('browser-pack'))) {
    await bumpBrowserPackRelease(pins, new Date());
  }
  await validateRuntimePins({ pins, now: new Date() });
}

async function applyNpmUpdates(pins, updates) {
  const packageJson = await readJson(packagePath);
  for (const update of updates) {
    packageJson.dependencies[update.key] = update.version;
    pins.npm[update.key] = {
      ...pins.npm[update.key],
      version: update.version,
      releasedAt: update.releasedAt,
      integrity: update.details.integrity,
    };
  }
  await writeJson(packagePath, packageJson);
  run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--workspaces=false'], path.dirname(packagePath));
  run('npm', ['audit', '--package-lock-only', '--ignore-scripts', '--workspaces=false', '--audit-level=critical'], path.dirname(packagePath));
  const lock = await readJson(lockPath);
  for (const update of updates) {
    pins.npm[update.key].integrity = lock.packages[`node_modules/${update.key}`].integrity;
  }
}

async function applyExternalUpdates(pins, updates) {
  const dockerfileBefore = await fs.readFile(dockerfilePath, 'utf8');
  let dockerfile = dockerfileBefore;
  for (const update of updates) {
    if (update.key === 'node') {
      const arm64 = update.details.arm64Sha256;
      const x64 = update.details.x64Sha256;
      dockerfile = replaceExact(dockerfile, pins.container.nodeVersion, update.version);
      dockerfile = replaceExact(dockerfile, pins.container.nodeSha256.arm64, arm64);
      dockerfile = replaceExact(dockerfile, pins.container.nodeSha256.x64, x64);
      pins.container.nodeVersion = update.version;
      pins.container.nodeSha256 = { arm64, x64 };
      pins.containerReleasedAt.nodeVersion = update.releasedAt;
    } else if (update.key === 'github-cli') {
      dockerfile = replaceExact(dockerfile, pins.container.githubCliVersion, update.version);
      pins.container.githubCliVersion = update.version;
      pins.containerReleasedAt.githubCliVersion = update.releasedAt;
    } else if (update.key === 'ubuntu-image') {
      dockerfile = replaceExact(dockerfile, pins.container.ubuntuImage, update.version);
      pins.container.ubuntuImage = update.version;
      pins.containerReleasedAt.ubuntuImage = update.releasedAt;
    } else if (update.key === 'golang-image') {
      dockerfile = replaceExact(dockerfile, pins.container.golangImage, update.details.image);
      pins.container.golangImage = update.details.image;
      pins.containerPolicy.golang.version = update.version;
      pins.containerReleasedAt.golangImage = update.releasedAt;
    } else if (update.key === 'uv') {
      pins.hostTools.uv.version = update.version;
      pins.hostTools.uv.releasedAt = update.releasedAt;
    }
  }
  if (dockerfile !== dockerfileBefore) await fs.writeFile(dockerfilePath, dockerfile);
}

function replaceExact(contents, current, replacement) {
  if (!contents.includes(current)) throw new Error(`Expected consumed pin ${current} was not found`);
  return contents.replaceAll(current, replacement);
}

async function bumpBrowserPackRelease(pins, now) {
  const config = await fs.readFile(browserConfigPath, 'utf8');
  const currentVersion = config.match(/BROWSER_PACK_VERSION = '([^']+)'/)?.[1];
  const currentDate = config.match(/BROWSER_PACK_DATE = '([^']+)'/)?.[1];
  if (!currentVersion || !currentDate) throw new Error('Browser-pack release constants are missing');

  const nextDate = now.toISOString().slice(0, 10);
  const nextVersion = `browser-pack-${nextDate}-r${pins.browser.chromiumRevision}-agent-${pins.npm['agent-browser'].version}`;
  const nextConfig = config
    .replace(`BROWSER_PACK_VERSION = '${currentVersion}'`, `BROWSER_PACK_VERSION = '${nextVersion}'`)
    .replace(`BROWSER_PACK_DATE = '${currentDate}'`, `BROWSER_PACK_DATE = '${nextDate}'`);
  await fs.writeFile(browserConfigPath, nextConfig);

  const workflow = await fs.readFile(browserWorkflowPath, 'utf8');
  const nextWorkflow = workflow.replaceAll(currentVersion, nextVersion).replaceAll(currentDate, nextDate);
  if (nextWorkflow === workflow) throw new Error('Browser-pack artifact workflow does not reference the current release');
  await fs.writeFile(browserWorkflowPath, nextWorkflow);
}

async function updatePlaywrightBrowserPins(pins) {
  const runtimeToolsRoot = path.dirname(packagePath);
  try {
    run('npm', ['ci', '--ignore-scripts', '--workspaces=false'], runtimeToolsRoot);
    const browsers = await readJson(path.join(runtimeToolsRoot, 'node_modules/playwright-core/browsers.json'));
    const chromium = browsers.browsers.find(({ name }) => name === 'chromium');
    const ffmpeg = browsers.browsers.find(({ name }) => name === 'ffmpeg');
    if (!chromium || !ffmpeg) throw new Error('Playwright browser metadata is incomplete');
    pins.browser = {
      chromiumRevision: chromium.revision,
      chromiumVersion: chromium.browserVersion,
      ffmpegRevision: ffmpeg.revision,
      macFfmpegRevision: ffmpeg.revisionOverrides?.['mac12-arm64'] ?? ffmpeg.revision,
    };
  } finally {
    await fs.rm(path.join(runtimeToolsRoot, 'node_modules'), { recursive: true, force: true });
  }
}

function hasRecordedOverride(pins, tool, version) {
  return pins.securityOverrides?.some((item) => item.tool === tool && item.version === version && item.reason?.trim().length >= 10);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--write') options.write = true;
    else if (args[index] === '--breaking') options.breaking = true;
    else if (args[index] === '--audit-baseline') options.auditBaseline = args[++index] ?? '';
    else if (args[index] === '--audit-candidate') options.auditCandidate = args[++index] ?? '';
    else if (args[index] === '--security-override-reason') options.securityOverrideReason = args[++index] ?? '';
    else if (args[index] === '--report') options.report = args[++index] ?? '';
    else if (args[index] === '--candidates') options.candidates = args[++index] ?? '';
    else if (args[index] === '--only') options.only = args[++index] ?? '';
    else if (args[index] === '--observations-in') options.observationsIn = args[++index] ?? '';
    else if (args[index] === '--observations-out') options.observationsOut = args[++index] ?? '';
    else throw new Error(`Unknown option: ${args[index]}`);
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
