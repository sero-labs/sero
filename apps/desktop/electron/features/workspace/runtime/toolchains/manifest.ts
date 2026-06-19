import { assertValidToolchainVersion } from './storage';
import { getBundledToolchainManifest } from './bundled-manifest-data';
import type {
  ArtifactSpec,
  ManagedToolArch,
  ManagedToolPlatform,
  ToolInstallPolicy,
  ToolName,
  ToolchainManifest,
} from './types';

const TOOL_NAMES = new Set<ToolName>([
  'node',
  'npm',
  'pnpm',
  'git',
  'ssh',
  'bash',
  'rg',
  'fd',
  'jq',
  'gh',
  'curl',
  'zip',
  'unzip',
  'uv',
]);
const PLATFORMS = new Set<ManagedToolPlatform>(['darwin', 'linux', 'win32']);
const ARCHES = new Set<ManagedToolArch>(['x64', 'arm64']);
const POLICIES = new Set<ToolInstallPolicy>(['core', 'on-demand', 'large-explicit']);
const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;

export function loadBundledToolchainManifest(): ToolchainManifest {
  return validateToolchainManifest(getBundledToolchainManifest());
}

export function createTestToolchainManifest(
  manifest: ToolchainManifest,
): ToolchainManifest {
  return validateToolchainManifest(manifest);
}

export function findArtifactForPlatform(
  manifest: ToolchainManifest,
  tool: ToolName,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ArtifactSpec | null {
  const supportedPlatform = platform as ManagedToolPlatform;
  const supportedArch = arch as ManagedToolArch;
  return Object.values(manifest.artifacts).find(
    (artifact) =>
      artifact.tool === tool &&
      artifact.platform === supportedPlatform &&
      artifact.arch === supportedArch,
  ) ?? null;
}

export function validateToolchainManifest(input: unknown): ToolchainManifest {
  if (!isRecord(input)) throw new Error('Toolchain manifest must be an object');
  const version = readString(input, 'version');
  assertValidToolchainVersion(version);

  const artifactsInput = input.artifacts;
  if (!isRecord(artifactsInput)) throw new Error('Toolchain manifest artifacts must be an object');

  const artifacts: Record<string, ArtifactSpec> = {};
  for (const [key, value] of Object.entries(artifactsInput)) {
    artifacts[key] = validateArtifactSpec(key, value);
  }

  return { version, artifacts };
}

function validateArtifactSpec(key: string, input: unknown): ArtifactSpec {
  if (!isRecord(input)) throw new Error(`Artifact ${key} must be an object`);

  const tool = readString(input, 'tool');
  const platform = readString(input, 'platform');
  const arch = readString(input, 'arch');
  const installPolicy = readString(input, 'installPolicy');
  const sha256 = readString(input, 'sha256');
  const unpackTo = readString(input, 'unpackTo');
  const url = readString(input, 'url');

  if (!TOOL_NAMES.has(tool as ToolName)) throw new Error(`Artifact ${key} has unknown tool ${tool}`);
  if (!PLATFORMS.has(platform as ManagedToolPlatform)) {
    throw new Error(`Artifact ${key} has unsupported platform ${platform}`);
  }
  if (!ARCHES.has(arch as ManagedToolArch)) throw new Error(`Artifact ${key} has unsupported arch ${arch}`);
  if (!POLICIES.has(installPolicy as ToolInstallPolicy)) {
    throw new Error(`Artifact ${key} has unsupported install policy ${installPolicy}`);
  }
  if (!SHA_256_PATTERN.test(sha256)) throw new Error(`Artifact ${key} has invalid sha256`);
  if (unpackTo.includes('..') || unpackTo.startsWith('/') || unpackTo.startsWith('\\')) {
    throw new Error(`Artifact ${key} has invalid unpackTo`);
  }
  validateUrl(key, url);

  const binPaths = readStringRecord(input, 'binPaths');
  const minVersion = input.minVersion === undefined ? undefined : readString(input, 'minVersion');

  return {
    tool: tool as ToolName,
    platform: platform as ManagedToolPlatform,
    arch: arch as ManagedToolArch,
    url,
    sha256,
    unpackTo,
    binPaths,
    minVersion,
    installPolicy: installPolicy as ToolInstallPolicy,
  };
}

function validateUrl(key: string, url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Artifact ${key} URL must use https`);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string at ${key}`);
  }
  return value;
}

function readStringRecord(record: Record<string, unknown>, key: string): Record<string, string> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`Expected object at ${key}`);
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string' || entryValue.length === 0) {
      throw new Error(`Expected non-empty string at ${key}.${entryKey}`);
    }
    result[entryKey] = entryValue;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
