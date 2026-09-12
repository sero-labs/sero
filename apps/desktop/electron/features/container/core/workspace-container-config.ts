import fs from 'fs';
import path from 'path';

import { SERO_AGENT_DIR, SERO_CAPTURE_ROOT } from '@electron/platform/env';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { getSharedPiDocsRoot } from '@electron/features/pi-docs/shared-pi-docs';
import { buildSeroLogMounts } from './log-access';
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

  // A bind mount skips a source that does not exist, and the capture root is
  // created by the first capture rather than at install time. Create it now, so a
  // fresh profile's container can reach the path that a tool result reports.
  // Best effort: a capture creates the directory itself, and a failure here must
  // not block container creation.
  await fs.promises.mkdir(SERO_CAPTURE_ROOT, { recursive: true, mode: 0o700 }).catch(() => undefined);

  return {
    workspaceId,
    hostPath,
    readOnlyMounts: [
      path.join(SERO_AGENT_DIR, 'skills'),
      path.join(SERO_AGENT_DIR, 'prompts'),
      path.join(SERO_AGENT_DIR, 'agent-plugins'),
      getSharedPiDocsRoot(),
      // The complete-output capture root. Read-only: a containerised agent must be
      // able to read a reported path and must never write to the capture.
      SERO_CAPTURE_ROOT,
    ],
    writableMounts,
    bindMounts: buildSeroLogMounts(),
  };
}
