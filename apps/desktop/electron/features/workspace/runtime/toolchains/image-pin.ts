import type { ToolchainManifest } from './types';

const BUILD_ARG_PATTERN = /^ARG[ \t]+([A-Za-z0-9_]+)=([^\s]+)[ \t]*$/gm;

/**
 * Parse `ARG NAME=value` declarations from a Dockerfile.
 */
export function parseDockerfileBuildArgs(dockerfile: string): Record<string, string> {
  const args: Record<string, string> = {};
  for (const match of dockerfile.matchAll(BUILD_ARG_PATTERN)) {
    args[match[1]] = match[2];
  }
  return args;
}

export function rtkImageVersion(dockerfile: string): string {
  const version = parseDockerfileBuildArgs(dockerfile).RTK_VERSION;
  if (!version) throw new Error('Dockerfile.sero-node does not declare ARG RTK_VERSION');
  return version;
}

/**
 * The RTK version is declared twice on purpose: the toolchain manifest pins the
 * host artifact, and the `sero-node` image installs the same version, so the
 * binary that decides a command rewrite and the binary that runs it cannot
 * drift. This check fails when either declaration changes alone.
 */
export function assertRtkImagePinMatchesManifest(dockerfile: string, manifest: ToolchainManifest): void {
  const imageVersion = rtkImageVersion(dockerfile);
  const manifestVersions = new Set<string>();
  for (const artifact of Object.values(manifest.artifacts)) {
    if (artifact.tool === 'rtk' && artifact.version) manifestVersions.add(artifact.version);
  }
  if (manifestVersions.size !== 1) {
    throw new Error(`Toolchain manifest must pin exactly one rtk version, found ${manifestVersions.size}`);
  }
  const manifestVersion = [...manifestVersions][0];
  if (imageVersion !== manifestVersion) {
    throw new Error(
      `RTK version drift: Dockerfile.sero-node declares ${imageVersion} but the toolchain manifest pins ${manifestVersion}`,
    );
  }
}
