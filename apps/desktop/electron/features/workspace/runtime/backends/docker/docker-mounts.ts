import { existsSync } from 'fs';
import path from 'path';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import type { ContainerConfig } from '@electron/features/container/core/types';

const WORKSPACE_TARGET = '/workspace';

export interface DockerMount {
  source: string;
  target: string;
  readonly?: boolean;
}

export function buildDockerMounts(config: ContainerConfig): DockerMount[] {
  const mounts: DockerMount[] = [{ source: config.hostPath, target: WORKSPACE_TARGET }];
  for (const hostPath of config.writableMounts ?? []) {
    if (existsSync(hostPath)) mounts.push({ source: hostPath, target: normalizeIdentityTarget(hostPath) });
  }
  for (const hostPath of config.readOnlyMounts ?? defaultAgentReadOnlyMounts()) {
    if (existsSync(hostPath)) mounts.push({ source: hostPath, target: normalizeIdentityTarget(hostPath), readonly: true });
  }
  return dedupeMounts(mounts);
}

export function mountArgs(mounts: DockerMount[]): string[] {
  return mounts.flatMap((mount) => ['--mount', formatMount(mount)]);
}

export function defaultAgentReadOnlyMounts(): string[] {
  return [path.join(SERO_AGENT_DIR, 'skills'), path.join(SERO_AGENT_DIR, 'prompts')];
}

export function formatMount(mount: DockerMount): string {
  const parts = [
    'type=bind',
    `source=${normalizeDockerSource(mount.source)}`,
    `target=${mount.target}`,
  ];
  if (mount.readonly) parts.push('readonly');
  return parts.join(',');
}

export function normalizeDockerSource(hostPath: string): string {
  return hostPath;
}

function normalizeIdentityTarget(hostPath: string): string {
  if (/^[A-Za-z]:[\\/]/.test(hostPath)) {
    const drive = hostPath[0].toLowerCase();
    const rest = hostPath.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
    return `/mnt/${drive}/${rest}`;
  }
  return hostPath.replace(/\\/g, '/');
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
