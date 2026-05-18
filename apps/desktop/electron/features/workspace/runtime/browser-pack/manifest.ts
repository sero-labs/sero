import generatedArtifacts from './generated-artifacts.json';
import type {
  BrowserArtifactAvailability,
  BrowserPackArch,
  BrowserPackArtifactAvailabilitySpec,
  BrowserPackArtifactSpec,
  BrowserPackManifest,
  BrowserPackPlatform,
} from './types';

const LOCAL_URL_BASE_ENV = 'SERO_BROWSER_PACK_BASE_URL';

interface BrowserPackGeneratedArtifactJson {
  platform: string;
  arch: string;
  slug: string;
  url?: string;
  sha256?: string;
  sizeBytes?: number;
  status?: string;
  available?: boolean;
  chromiumExecutableCandidates: string[];
  ffmpegCandidates: string[];
  agentBrowserCandidates: string[];
}

interface BrowserPackGeneratedArtifact extends BrowserPackGeneratedArtifactJson {
  platform: BrowserPackPlatform;
  arch: BrowserPackArch;
}

interface BrowserPackGeneratedMetadataJson {
  version: string;
  pins: {
    playwrightVersion: string;
    chromiumRevision: string;
    ffmpegRevision: string;
  };
  artifacts: Record<string, BrowserPackGeneratedArtifactJson>;
}

interface BrowserPackGeneratedMetadata extends BrowserPackGeneratedMetadataJson {
  artifacts: Record<string, BrowserPackGeneratedArtifact>;
}

const GENERATED_METADATA = normalizeGeneratedMetadata(generatedArtifacts);

export const BROWSER_PACK_MANIFEST: BrowserPackManifest = createBrowserPackManifest(GENERATED_METADATA, undefined);

export function getBrowserPackManifest(): BrowserPackManifest {
  return createBrowserPackManifest(GENERATED_METADATA, process.env[LOCAL_URL_BASE_ENV]);
}

export function findBrowserArtifact(
  manifest: BrowserPackManifest,
  platform: NodeJS.Platform,
  arch: string,
): { key: string; artifact: BrowserPackArtifactSpec } | null {
  const availability = findBrowserArtifactAvailability(manifest, platform, arch);
  return availability.state === 'built' ? { key: availability.key, artifact: availability.artifact } : null;
}

export function findBrowserArtifactAvailability(
  manifest: BrowserPackManifest,
  platform: NodeJS.Platform,
  arch: string,
): BrowserArtifactAvailability {
  const builtEntry = Object.entries(manifest.artifacts).find(([, artifact]) => artifact.platform === platform && artifact.arch === arch);
  if (builtEntry) return { state: 'built', key: builtEntry[0], artifact: builtEntry[1] };

  const availabilityEntry = Object.entries(manifest.artifactAvailability ?? {})
    .find(([, artifact]) => artifact.platform === platform && artifact.arch === arch);
  if (availabilityEntry) {
    const artifact = availabilityEntry[1];
    return { state: 'missing', key: availabilityEntry[0], platform: artifact.platform, arch: artifact.arch, slug: artifact.slug };
  }

  return { state: 'unsupported', platform, arch };
}

export function createBrowserPackManifest(
  metadata: BrowserPackGeneratedMetadata,
  urlBaseOverride = process.env[LOCAL_URL_BASE_ENV],
): BrowserPackManifest {
  return {
    version: metadata.version,
    artifacts: Object.fromEntries(
      Object.entries(metadata.artifacts)
        .filter(([, artifact]) => isBuiltArtifact(artifact))
        .map(([key, artifact]) => [key, toManifestArtifact(metadata, artifact, urlBaseOverride)]),
    ),
    artifactAvailability: Object.fromEntries(
      Object.entries(metadata.artifacts).map(([key, artifact]) => [key, toAvailabilityArtifact(artifact)]),
    ),
  };
}

function normalizeGeneratedMetadata(metadata: BrowserPackGeneratedMetadataJson): BrowserPackGeneratedMetadata {
  return {
    ...metadata,
    artifacts: Object.fromEntries(
      Object.entries(metadata.artifacts).map(([key, artifact]) => [key, normalizeGeneratedArtifact(key, artifact)]),
    ),
  };
}

function normalizeGeneratedArtifact(key: string, artifact: BrowserPackGeneratedArtifactJson): BrowserPackGeneratedArtifact {
  if (!isBrowserPackPlatform(artifact.platform)) throw new Error(`Invalid browser pack platform for ${key}: ${artifact.platform}`);
  if (!isBrowserPackArch(artifact.arch)) throw new Error(`Invalid browser pack architecture for ${key}: ${artifact.arch}`);
  return { ...artifact, platform: artifact.platform, arch: artifact.arch };
}

function isBrowserPackPlatform(platform: string): platform is BrowserPackPlatform {
  return platform === 'darwin' || platform === 'linux' || platform === 'win32';
}

function isBrowserPackArch(arch: string): arch is BrowserPackArch {
  return arch === 'x64' || arch === 'arm64';
}

function toAvailabilityArtifact(artifact: BrowserPackGeneratedArtifact): BrowserPackArtifactAvailabilitySpec {
  return {
    platform: artifact.platform,
    arch: artifact.arch,
    slug: artifact.slug,
    available: isBuiltArtifact(artifact),
    status: artifact.status ?? 'pending',
  };
}

function toManifestArtifact(
  metadata: BrowserPackGeneratedMetadata,
  artifact: BrowserPackGeneratedArtifact,
  urlBaseOverride: string | undefined,
): BrowserPackArtifactSpec {
  if (!isBuiltArtifact(artifact)) throw new Error(`Pending browser pack artifact cannot be installed: ${artifact.slug}`);
  return {
    platform: artifact.platform,
    arch: artifact.arch,
    url: withUrlBaseOverride(artifact.url, artifact.slug, urlBaseOverride),
    sha256: artifact.sha256,
    unpackTo: 'browser',
    playwrightVersion: metadata.pins.playwrightVersion,
    chromiumRevision: metadata.pins.chromiumRevision,
    ffmpegRevision: metadata.pins.ffmpegRevision,
    chromiumExecutableCandidates: artifact.chromiumExecutableCandidates,
    ffmpegCandidates: artifact.ffmpegCandidates,
    agentBrowserCandidates: artifact.agentBrowserCandidates,
  };
}

function isBuiltArtifact(
  artifact: BrowserPackGeneratedArtifact,
): artifact is BrowserPackGeneratedArtifact & { url: string; sha256: string; sizeBytes: number; status: 'built'; available: true } {
  return artifact.status === 'built'
    && artifact.available === true
    && typeof artifact.url === 'string'
    && /^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')
    && typeof artifact.sizeBytes === 'number'
    && artifact.sizeBytes > 0;
}

function withUrlBaseOverride(defaultUrl: string, slug: string, urlBaseOverride: string | undefined): string {
  const baseUrl = urlBaseOverride?.replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/${slug}.tar.gz` : defaultUrl;
}
