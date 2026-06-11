import path from 'path';

import type {
  WorkspaceAccessRoot,
  WorkspaceAccessRootKind,
  WorkspaceAccessRootsResult,
} from '@sero-ai/common';
import type { WorkspaceRoot } from '@/types/ipc';
import type { RuntimeBackendId } from './runtime/types';
import { RUNTIME_WORKSPACE_PATH, toRuntimeIdentityMountPath } from './runtime/runtime-paths';
import { pathExists as defaultPathExists } from './registry-recovery';
import type { WorkspaceManager } from './manager';

type WorkspaceAccessRootsManager = Pick<
  WorkspaceManager,
  'getPath' | 'getConfig' | 'getMounts' | 'getRoots' | 'getRuntimeBackendDetails'
>;

interface ListWorkspaceAccessRootsOptions {
  backend?: RuntimeBackendId;
  mode?: 'host' | 'container';
  pathExists?: (hostPath: string) => Promise<boolean>;
}

interface CandidateRoot {
  id: string;
  name: string;
  kind: WorkspaceAccessRootKind;
  hostPath: string;
  writable: boolean;
  primary?: boolean;
  source?: WorkspaceAccessRoot['source'];
}

export async function listWorkspaceAccessRoots(
  mgr: WorkspaceAccessRootsManager,
  workspaceId: string,
  options: ListWorkspaceAccessRootsOptions = {},
): Promise<WorkspaceAccessRootsResult> {
  const workspacePath = mgr.getPath(workspaceId);
  if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);

  const [config, mounts, roots, backend] = await Promise.all([
    mgr.getConfig(workspaceId),
    mgr.getMounts(workspaceId),
    mgr.getRoots(workspaceId),
    resolveBackend(mgr, workspaceId, options.backend),
  ]);
  const mode = options.mode ?? (backend === 'host' ? 'host' : 'container');
  const pathExists = options.pathExists ?? defaultPathExists;
  const warnings: string[] = [];
  const resultRoots: WorkspaceAccessRoot[] = [];
  const seen = new Set<string>();

  const addRoot = async (candidate: CandidateRoot) => {
    const hostPath = normalizeHostPath(candidate.hostPath);
    if (!await pathExists(hostPath)) {
      warnings.push(`Skipped missing ${candidate.kind} root "${candidate.name}": ${hostPath}`);
      return;
    }

    const key = canonicalHostPathKey(hostPath);
    if (seen.has(key)) {
      warnings.push(`Skipped duplicate ${candidate.kind} root "${candidate.name}": ${hostPath}`);
      return;
    }

    seen.add(key);
    resultRoots.push({
      id: candidate.id,
      name: candidate.name,
      kind: candidate.kind,
      hostPath,
      runtimePath: runtimePathFor(hostPath, candidate.primary === true, mode),
      writable: candidate.writable,
      ...(candidate.source ? { source: candidate.source } : {}),
    });
  };

  await addRoot({
    id: 'workspace',
    name: config?.name ?? workspaceId,
    kind: 'primary',
    hostPath: workspacePath,
    writable: true,
    primary: true,
  });

  for (const refId of config?.references ?? []) {
    const refPath = mgr.getPath(refId);
    if (!refPath) {
      warnings.push(`Skipped stale workspace reference "${refId}" from ${workspaceId}`);
      continue;
    }
    const refConfig = await mgr.getConfig(refId);
    await addRoot({
      id: `reference:${refId}`,
      name: refConfig?.name ?? refId,
      kind: 'workspace-reference',
      hostPath: refPath,
      writable: true,
      source: { workspaceId: refId },
    });
  }

  for (const [index, mountPath] of mounts.entries()) {
    await addRoot({
      id: `mount:${index + 1}`,
      name: hostPathBasename(mountPath) || mountPath,
      kind: 'folder-mount',
      hostPath: mountPath,
      writable: true,
    });
  }

  for (const root of roots) {
    await addRoot({
      id: root.id,
      name: root.name,
      kind: rootKind(root),
      hostPath: root.path,
      writable: true,
      source: { rootId: root.id },
    });
  }

  return {
    workspaceId,
    runtime: { backend, mode },
    roots: resultRoots,
    warnings,
  };
}

async function resolveBackend(
  mgr: Pick<WorkspaceAccessRootsManager, 'getRuntimeBackendDetails'>,
  workspaceId: string,
  backend?: RuntimeBackendId,
): Promise<RuntimeBackendId> {
  if (backend) return backend;
  return (await mgr.getRuntimeBackendDetails(workspaceId)).backend;
}

function rootKind(root: WorkspaceRoot): WorkspaceAccessRootKind {
  return root.kind === 'linked-plugin' ? 'linked-plugin' : 'additional-root';
}

function runtimePathFor(hostPath: string, primary: boolean, mode: 'host' | 'container'): string {
  if (mode === 'host') return hostPath;
  return primary ? RUNTIME_WORKSPACE_PATH : toRuntimeIdentityMountPath(hostPath);
}

function normalizeHostPath(hostPath: string): string {
  if (isWindowsDrivePath(hostPath)) return path.win32.resolve(hostPath);
  return path.resolve(hostPath);
}

function hostPathBasename(hostPath: string): string {
  return isWindowsDrivePath(hostPath) ? path.win32.basename(hostPath) : path.basename(hostPath);
}

function canonicalHostPathKey(hostPath: string): string {
  const normalized = isWindowsDrivePath(hostPath)
    ? path.win32.resolve(hostPath).replace(/\\/g, '/').toLowerCase()
    : path.resolve(hostPath);
  return normalized.replace(/\/+$/, '');
}

function isWindowsDrivePath(hostPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(hostPath);
}

export type { ListWorkspaceAccessRootsOptions, WorkspaceAccessRootsManager };
