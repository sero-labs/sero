import path from 'path';

import { SERO_AGENT_DIR } from '../env';
import type { WorkspaceManager } from '../workspace/manager';
import type { ContainerConfig } from './types';

export async function buildWorkspaceContainerConfig(
  workspaceManager: WorkspaceManager,
  workspaceId: string,
  hostPath: string,
  opts?: { isolated?: boolean },
): Promise<ContainerConfig> {
  let writableMounts: string[] = [];

  if (!opts?.isolated) {
    const refs = await workspaceManager.getReferences(workspaceId);
    for (const refId of refs) {
      const refPath = workspaceManager.getPath(refId);
      if (refPath && path.resolve(refPath) !== path.resolve(hostPath)) {
        writableMounts.push(refPath);
      }
    }

    const extraMounts = await workspaceManager.getMounts(workspaceId);
    for (const mountPath of extraMounts) {
      if (path.resolve(mountPath) !== path.resolve(hostPath) && !writableMounts.includes(mountPath)) {
        writableMounts.push(mountPath);
      }
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
