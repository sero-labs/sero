import generatedArtifacts from './generated-artifacts.json';
import type {
  ArtifactSpec,
  ManagedToolArch,
  ManagedToolPlatform,
  ToolInstallPolicy,
  ToolName,
  ToolchainManifest,
} from './types';

const LOCAL_URL_BASE_ENV = 'SERO_TOOLCHAIN_BASE_URL';

interface ToolchainGeneratedArtifactJson {
  tool: string;
  platform: string;
  arch: string;
  slug: string;
  status?: string;
  available?: boolean;
  url?: string;
  sha256?: string;
  unpackTo: string;
  binPaths: Record<string, string>;
  minVersion?: string;
  installPolicy: string;
}

interface ToolchainGeneratedArtifact extends ToolchainGeneratedArtifactJson {
  tool: ToolName;
  platform: ManagedToolPlatform;
  arch: ManagedToolArch;
  installPolicy: ToolInstallPolicy;
}

interface ToolchainGeneratedMetadataJson {
  version: string;
  releaseTag: string;
  artifacts: Record<string, ToolchainGeneratedArtifactJson>;
}

interface ToolchainGeneratedMetadata extends ToolchainGeneratedMetadataJson {
  artifacts: Record<string, ToolchainGeneratedArtifact>;
}

const GENERATED_METADATA = normalizeGeneratedMetadata(generatedArtifacts);

export const bundledToolchainManifest: ToolchainManifest = createToolchainManifest(GENERATED_METADATA, undefined);

export function getBundledToolchainManifest(): ToolchainManifest {
  return createToolchainManifest(GENERATED_METADATA, process.env[LOCAL_URL_BASE_ENV]);
}

export function createToolchainManifest(
  metadata: ToolchainGeneratedMetadata,
  urlBaseOverride = process.env[LOCAL_URL_BASE_ENV],
): ToolchainManifest {
  const artifacts: Record<string, ArtifactSpec> = {};
  for (const [key, artifact] of Object.entries(metadata.artifacts)) {
    if (isBuiltArtifact(artifact)) artifacts[key] = toManifestArtifact(artifact, urlBaseOverride);
  }
  return {
    version: metadata.version,
    artifacts,
  };
}

function normalizeGeneratedMetadata(metadata: ToolchainGeneratedMetadataJson): ToolchainGeneratedMetadata {
  return {
    ...metadata,
    artifacts: Object.fromEntries(
      Object.entries(metadata.artifacts).map(([key, artifact]) => [key, normalizeGeneratedArtifact(key, artifact)]),
    ),
  };
}

function normalizeGeneratedArtifact(key: string, artifact: ToolchainGeneratedArtifactJson): ToolchainGeneratedArtifact {
  if (!isToolName(artifact.tool)) throw new Error(`Invalid toolchain tool for ${key}: ${artifact.tool}`);
  if (!isToolchainPlatform(artifact.platform)) throw new Error(`Invalid toolchain platform for ${key}: ${artifact.platform}`);
  if (!isToolchainArch(artifact.arch)) throw new Error(`Invalid toolchain arch for ${key}: ${artifact.arch}`);
  if (!isToolInstallPolicy(artifact.installPolicy)) throw new Error(`Invalid toolchain install policy for ${key}: ${artifact.installPolicy}`);
  return {
    ...artifact,
    tool: artifact.tool,
    platform: artifact.platform,
    arch: artifact.arch,
    installPolicy: artifact.installPolicy,
  };
}

function toManifestArtifact(
  artifact: ToolchainGeneratedArtifact & { url: string; sha256: string; status: 'built'; available: true },
  urlBaseOverride: string | undefined,
): ArtifactSpec {
  return {
    tool: artifact.tool,
    platform: artifact.platform,
    arch: artifact.arch,
    url: withUrlBaseOverride(artifact.url, artifact.slug, urlBaseOverride),
    sha256: artifact.sha256,
    unpackTo: artifact.unpackTo,
    binPaths: artifact.binPaths,
    minVersion: artifact.minVersion,
    installPolicy: artifact.installPolicy,
  };
}

function isBuiltArtifact(
  artifact: ToolchainGeneratedArtifact,
): artifact is ToolchainGeneratedArtifact & { url: string; sha256: string; status: 'built'; available: true } {
  return artifact.status === 'built'
    && artifact.available === true
    && typeof artifact.url === 'string'
    && /^[a-f0-9]{64}$/.test(artifact.sha256 ?? '');
}

function withUrlBaseOverride(defaultUrl: string, slug: string, urlBaseOverride: string | undefined): string {
  const baseUrl = urlBaseOverride?.replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/${slug}.tar.gz` : defaultUrl;
}

function isToolName(tool: string): tool is ToolName {
  return ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash', 'rg', 'fd', 'jq', 'gh', 'curl', 'zip', 'unzip'].includes(tool);
}

function isToolchainPlatform(platform: string): platform is ManagedToolPlatform {
  return platform === 'darwin' || platform === 'linux' || platform === 'win32';
}

function isToolchainArch(arch: string): arch is ManagedToolArch {
  return arch === 'x64' || arch === 'arm64';
}

function isToolInstallPolicy(policy: string): policy is ToolInstallPolicy {
  return policy === 'core' || policy === 'on-demand' || policy === 'large-explicit';
}
