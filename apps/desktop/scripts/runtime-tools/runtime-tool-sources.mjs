import { createHash } from 'node:crypto';

const DAY_MS = 86_400_000;

export async function discoverRuntimeUpdates(pins, now = new Date()) {
  const candidates = [];
  await Promise.all([
    discoverNpm(pins, now, candidates),
    discoverNode(pins, now, candidates),
    discoverGitHubCli(pins, now, candidates),
    discoverContainerImages(pins, now, candidates),
    discoverUv(pins, now, candidates),
  ]);
  return candidates.sort((left, right) => left.key.localeCompare(right.key) || left.mode.localeCompare(right.mode));
}

async function discoverNpm(pins, now, candidates) {
  await Promise.all(Object.entries(pins.npm).map(async ([name, current]) => {
    const metadata = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    addVersionCandidates({
      candidates,
      key: name,
      label: name,
      source: 'npm',
      currentVersion: current.version,
      releases: Object.keys(metadata.versions ?? {}).map((version) => ({
        version,
        releasedAt: metadata.time?.[version],
        deprecated: Boolean(metadata.versions[version]?.deprecated),
        integrity: metadata.versions[version]?.dist?.integrity,
      })),
      routineUpdates: current.routineUpdates,
      pins,
      now,
    });
  }));
}

async function discoverNode(pins, now, candidates) {
  const releases = await fetchJson('https://nodejs.org/dist/index.json');
  addVersionCandidates({
    candidates,
    key: 'node',
    label: 'Node.js',
    source: 'node',
    currentVersion: pins.container.nodeVersion,
    releases: releases.map((release) => ({
      version: release.version.replace(/^v/, ''),
      releasedAt: `${release.date}T23:59:59.999Z`,
    })),
    routineUpdates: 'minor',
    pins,
    now,
  });
  await Promise.all(candidates.filter(({ source }) => source === 'node').map(async (item) => {
    const checksums = await fetchText(`https://nodejs.org/dist/v${item.version}/SHASUMS256.txt`);
    item.details = {
      arm64Sha256: checksumFor(checksums, `node-v${item.version}-linux-arm64.tar.xz`),
      x64Sha256: checksumFor(checksums, `node-v${item.version}-linux-x64.tar.xz`),
    };
  }));
}

async function discoverGitHubCli(pins, now, candidates) {
  const releases = await fetchAllGitHubReleases('cli/cli');
  addVersionCandidates({
    candidates,
    key: 'github-cli',
    label: 'GitHub CLI',
    source: 'github-release',
    currentVersion: pins.container.githubCliVersion,
    releases: releases.map(githubRelease),
    routineUpdates: 'minor',
    pins,
    now,
  });
}

async function discoverUv(pins, now, candidates) {
  const releases = await fetchAllGitHubReleases('astral-sh/uv');
  addVersionCandidates({
    candidates,
    key: 'uv',
    label: 'uv',
    source: 'github-release',
    currentVersion: pins.hostTools.uv.version,
    releases: releases.map(githubRelease),
    routineUpdates: pins.hostTools.uv.routineUpdates,
    pins,
    now,
  });
}

function githubRelease(release) {
  return {
    version: release.tag_name.replace(/^v/, ''),
    releasedAt: release.published_at,
    deprecated: release.draft || release.prerelease,
    details: {
      releaseId: String(release.id),
      updatedAt: release.updated_at,
    },
  };
}

async function discoverContainerImages(pins, now, candidates) {
  const [ubuntu, golang] = await Promise.all([
    fetchJson(`https://registry.hub.docker.com/v2/repositories/library/ubuntu/tags/${pins.containerPolicy.ubuntu.tag}`),
    fetchJson('https://registry.hub.docker.com/v2/repositories/library/golang/tags?page_size=100&name=bookworm'),
  ]);
  const ubuntuDigest = await resolveDockerDigest('library/ubuntu', pins.containerPolicy.ubuntu.tag);
  const ubuntuImage = `ubuntu:${pins.containerPolicy.ubuntu.tag}@${ubuntuDigest}`;
  if (ubuntuImage !== pins.container.ubuntuImage) {
    candidates.push(candidate({
      key: 'ubuntu-image',
      label: 'Ubuntu container image',
      source: 'docker-hub',
      currentVersion: pins.container.ubuntuImage,
      version: ubuntuImage,
      releasedAt: ubuntu.tag_last_pushed ?? ubuntu.last_updated,
      mode: 'routine',
      pins,
      now,
    }));
  }

  const releases = golang.results
    .filter(({ name }) => /^\d+\.\d+\.\d+-bookworm$/.test(name))
    .map((tag) => ({
      version: tag.name.replace(/-bookworm$/, ''),
      releasedAt: tag.tag_last_pushed ?? tag.last_updated,
    }));
  const selected = selectReleases(
    releases,
    pins.containerPolicy.golang.version,
    pins.containerPolicy.golang.routineUpdates,
  );
  for (const [mode, release] of Object.entries(selected)) {
    if (!release) continue;
    const digest = await resolveDockerDigest('library/golang', `${release.version}-bookworm`);
    candidates.push(candidate({
      key: 'golang-image',
      label: 'Go container image',
      source: 'docker-hub',
      currentVersion: pins.containerPolicy.golang.version,
      version: release.version,
      releasedAt: release.releasedAt,
      mode,
      details: { image: `golang:${release.version}-bookworm@${digest}` },
      pins,
      now,
    }));
  }
}

function addVersionCandidates(options) {
  const releases = options.releases.filter(({ version, releasedAt, deprecated }) => (
    isStableVersion(version) && releasedAt && !deprecated && compareVersions(version, options.currentVersion) > 0
  ));
  const selected = selectReleases(releases, options.currentVersion, options.routineUpdates);
  for (const [mode, release] of Object.entries(selected)) {
    if (!release) continue;
    options.candidates.push(candidate({ ...options, ...release, mode }));
  }
}

function selectReleases(releases, currentVersion, routineUpdates) {
  const selected = { routine: undefined, breaking: undefined };
  for (const release of releases.sort((left, right) => compareVersions(left.version, right.version))) {
    const mode = isRoutineUpdate(currentVersion, release.version, routineUpdates) ? 'routine' : 'breaking';
    selected[mode] = release;
  }
  return selected;
}

function candidate({ key, label, source, currentVersion, version, releasedAt, mode, details, integrity, pins, now }) {
  const eligibleAt = new Date(Date.parse(releasedAt) + pins.policy.minimumReleaseAgeDays * DAY_MS).toISOString();
  return {
    key,
    label,
    source,
    currentVersion,
    version,
    releasedAt,
    eligibleAt,
    eligible: now.getTime() >= Date.parse(eligibleAt),
    mode,
    details: { ...details, ...(integrity ? { integrity } : {}) },
  };
}

export function applyObservationWindow(candidates, observations, now, minimumReleaseAgeDays) {
  const next = {};
  for (const item of candidates) {
    const identity = JSON.stringify([item.source, item.key, item.version, item.details]);
    const previous = observations[item.key]?.[item.mode];
    const firstSeenAt = previous?.identity === identity ? previous.firstSeenAt : now.toISOString();
    const observedEligibleAt = new Date(Date.parse(firstSeenAt) + minimumReleaseAgeDays * DAY_MS).toISOString();
    item.firstSeenAt = firstSeenAt;
    item.eligibleAt = new Date(Math.max(Date.parse(item.eligibleAt), Date.parse(observedEligibleAt))).toISOString();
    item.eligible = now.getTime() >= Date.parse(item.eligibleAt);
    next[item.key] ??= {};
    next[item.key][item.mode] = { identity, firstSeenAt };
  }
  return next;
}

export function renderRuntimeUpdateReport(pins, candidates, now = new Date()) {
  const rows = candidates.map((item) => (
    `| ${item.label} | \`${short(item.currentVersion)}\` | \`${short(item.version)}\` | ${item.mode} | ${item.eligible ? 'ready' : `waiting until ${item.eligibleAt.slice(0, 10)}`} |`
  ));
  const unchanged = [
    ...Object.keys(pins.npm),
    'Node.js',
    'GitHub CLI',
    'Ubuntu container image',
    'Go container image',
    'uv',
  ].filter((label) => !candidates.some((item) => item.label === label));
  const gaps = (pins.legacyArtifactGaps ?? []).map(({ tools, reason }) => `- **${tools}:** ${reason}`);
  return [
    '# Packaged runtime dependency status',
    '',
    `Last successful check: ${now.toISOString()}`,
    '',
    '| Dependency | Current pin | Available | Change | Status |',
    '| --- | --- | --- | --- | --- |',
    ...(rows.length ? rows : ['| None | — | — | — | All checked dependencies are current |']),
    '',
    `Current: ${unchanged.join(', ') || 'None'}.`,
    '',
    '## Coverage gaps',
    '',
    ...(gaps.length ? gaps : ['None.']),
    '',
    'Routine updates are grouped in one draft PR. Breaking updates use a separate draft PR. Nothing is merged or published automatically.',
  ].join('\n');
}

function short(value) {
  return value.length > 48 ? `${value.slice(0, 45)}…` : value;
}

export function isStableVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function isRoutineUpdate(currentVersion, candidateVersion, routineUpdates) {
  const [currentMajor, currentMinor] = currentVersion.split('.').map(Number);
  const [candidateMajor, candidateMinor] = candidateVersion.split('.').map(Number);
  if (candidateMajor !== currentMajor) return false;
  return routineUpdates === 'minor' || candidateMinor === currentMinor;
}

async function fetchAllGitHubReleases(repository) {
  return fetchJson(`https://api.github.com/repos/${repository}/releases?per_page=100`);
}

async function resolveDockerDigest(repository, reference) {
  const tokenUrl = new URL('https://auth.docker.io/token');
  tokenUrl.searchParams.set('service', 'registry.docker.io');
  tokenUrl.searchParams.set('scope', `repository:${repository}:pull`);
  const { token } = await fetchJson(tokenUrl.toString());
  const response = await fetch(`https://registry-1.docker.io/v2/${repository}/manifests/${reference}`, {
    headers: {
      accept: [
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.oci.image.manifest.v1+json',
        'application/vnd.docker.distribution.manifest.v2+json',
      ].join(', '),
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(`Docker manifest ${repository}:${reference} returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const calculated = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const reported = response.headers.get('docker-content-digest');
  if (reported !== calculated) throw new Error(`Docker manifest digest mismatch for ${repository}:${reference}`);
  return calculated;
}

async function fetchJson(url) {
  const headers = { accept: 'application/json', 'user-agent': 'sero-runtime-tool-updater' };
  if (process.env.GITHUB_TOKEN && new URL(url).hostname === 'api.github.com') {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    headers['x-github-api-version'] = '2022-11-28';
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: 'text/plain', 'user-agent': 'sero-runtime-tool-updater' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

function checksumFor(checksums, filename) {
  const checksum = checksums.split('\n').find((line) => line.endsWith(`  ${filename}`))?.split(/\s+/)[0];
  if (!checksum) throw new Error(`Node checksum is missing for ${filename}`);
  return checksum;
}
