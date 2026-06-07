import { existsSync } from 'fs';
import path from 'path';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import type { ContainerConfig } from '@electron/features/container/core/types';
import { getSharedPiDocsRoot } from '@electron/features/pi-docs/shared-pi-docs';
import { toRuntimeIdentityMountPath } from '../../runtime-paths';

const WORKSPACE_TARGET = '/workspace';

export interface DockerMount {
  source: string;
  target: string;
  readonly?: boolean;
}

export function buildDockerMounts(config: ContainerConfig, platform: NodeJS.Platform = process.platform): DockerMount[] {
  const mounts: DockerMount[] = [{ source: normalizeDockerSource(config.hostPath, platform), target: WORKSPACE_TARGET }];
  for (const hostPath of config.writableMounts ?? []) {
    if (existsSync(hostPath)) mounts.push({ source: normalizeDockerSource(hostPath, platform), target: normalizeIdentityTarget(hostPath) });
  }
  for (const hostPath of config.readOnlyMounts ?? defaultAgentReadOnlyMounts()) {
    if (existsSync(hostPath)) mounts.push({ source: normalizeDockerSource(hostPath, platform), target: normalizeIdentityTarget(hostPath), readonly: true });
  }
  for (const mount of config.bindMounts ?? []) {
    if (existsSync(mount.source)) {
      const dockerMount: DockerMount = {
        source: normalizeDockerSource(mount.source, platform),
        target: mount.target,
      };
      if (mount.readonly) dockerMount.readonly = true;
      mounts.push(dockerMount);
    }
  }
  return dedupeMounts(mounts);
}

export function mountArgs(mounts: DockerMount[]): string[] {
  return mounts.flatMap((mount) => ['--mount', formatMount(mount)]);
}

export function defaultAgentReadOnlyMounts(): string[] {
  return [
    path.join(SERO_AGENT_DIR, 'skills'),
    path.join(SERO_AGENT_DIR, 'prompts'),
    getSharedPiDocsRoot(),
  ];
}

export function formatMount(mount: DockerMount): string {
  // Bind-mount sources go into a comma-separated --mount value. A comma in any field would split
  // the spec and silently mount the wrong path. Fail loudly so the misconfiguration is surfaced.
  if (mount.source.includes(',')) {
    throw new Error(`Docker mount source cannot contain a comma: ${mount.source}`);
  }
  const parts = [
    'type=bind',
    `source=${mount.source}`,
    `target=${mount.target}`,
  ];
  if (mount.readonly) parts.push('readonly');
  return parts.join(',');
}

/**
 * Normalize a host path for use as a Docker bind-mount source. On Windows the bind-mount CSV is
 * fragile around backslashes, so collapse `C:\foo` to `C:/foo`. Docker Desktop accepts both forms,
 * and `docker inspect` returns the forward-slash variant — using forward slashes keeps the mount
 * signature comparisons stable across container restarts.
 */
export function normalizeDockerSource(hostPath: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32' && /^[A-Za-z]:[\\/]/.test(hostPath)) {
    return hostPath.replace(/\\/g, '/');
  }
  return hostPath;
}

function normalizeIdentityTarget(hostPath: string): string {
  return toRuntimeIdentityMountPath(hostPath);
}

function dedupeMounts(mounts: DockerMount[]): DockerMount[] {
  const seen = new Set<string>();
  const result: DockerMount[] = [];
  for (const mount of mounts) {
    const key = `${mount.source}->${mount.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mount);
  }
  return result;
}
