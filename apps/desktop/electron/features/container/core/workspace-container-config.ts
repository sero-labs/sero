import path from 'path';

import { SERO_AGENT_DIR } from '../../../platform/env';
import type { WorkspaceManager } from '../../workspace/manager';
import type { ContainerConfig } from './types';

export async function buildWorkspaceContainerConfig(
  workspaceManager: WorkspaceManager,
  workspaceId: string,
  hostPath: string,
  opts?: { isolated?: boolean },
): Promise<ContainerConfig> {
  const writableMounts: string[] = [];
  const resolvedHost = path.resolve(hostPath);

  const pushMount = (candidate: string) => {
    const resolved = path.resolve(candidate);
    if (resolved === resolvedHost) return;
    if (writableMounts.some((m) => path.resolve(m) === resolved)) return;
    writableMounts.push(resolved);
  };

  if (!opts?.isolated) {
    const refs = await workspaceManager.getReferences(workspaceId);
    for (const refId of refs) {
      const refPath = workspaceManager.getPath(refId);
      if (refPath) pushMount(refPath);
    }

    const extraMounts = await workspaceManager.getMounts(workspaceId);
    for (const mountPath of extraMounts) {
      pushMount(mountPath);
    }

    // Multi-root: each additional root gets its own bind-mount so the
    // container sees the same host paths the renderer's editor IPC uses.
    // Roots are stored separately from `config.mounts` so this merge is
    // the only place provenance matters.
    const additionalRoots = await workspaceManager.getRoots(workspaceId);
    for (const root of additionalRoots) {
      pushMount(root.path);
    }
  }

  return {
    workspaceId,
    hostPath,
    readOnlyMounts: [
      path.join(SERO_AGENT_DIR, 'skills'),
      path.join(SERO_AGENT_DIR, 'prompts'),
    ],
    writableMounts,
  };
}
