/**
 * Workspace container synchronisation helpers.
 *
 * Both the workspace IPC handlers and the workspace CLI commands need
 * to recreate a workspace's macOS container after mutating its mounts,
 * references, or roots so the new bind-mounts take effect immediately.
 *
 * Extracted from `electron/ipc/workspace/workspace.ts` so the CLI layer
 * can call the same logic without duplicating it.
 */

import { runtimeManager } from '@electron/shared/infra/shared-infra';
import { showNotification } from '@electron/platform/desktop/notifications';

/**
 * Whether the workspace has any active terminal sessions on its
 * container. We use this as a proxy for "agent is currently doing
 * work" — if so, container recreation is deferred so we don't kill
 * a running session out from under the user.
 */
function hasActiveSessionsForWorkspace(workspaceId: string): boolean {
  try {
    const sessions = runtimeManager.getWorkspaceTerminalIds(workspaceId);
    if (sessions.length > 0) return true;
  } catch {
    // Terminal manager may not track this workspace — that's fine
  }
  return false;
}

/**
 * Recreate a workspace's container if it's currently running so that
 * mount changes (added/removed references, mounts, or roots) take
 * effect dynamically.
 *
 * If the container has active terminals, the recreation is deferred:
 * the config change is already persisted, so the next container start
 * (on session create or manual restart) will pick up the new mounts.
 * A notification tells the user the change is pending.
 */
export async function recreateContainerIfRunning(workspaceId: string): Promise<void> {
  if (!runtimeManager.hasRuntime(workspaceId)) return;

  const runtime = await runtimeManager.getRuntime(workspaceId);
  if (runtime.backend === 'mac-host') return;

  if (hasActiveSessionsForWorkspace(workspaceId)) {
    console.log(
      `[workspace] Deferring container recreation for ${workspaceId} — active sessions present`,
    );
    showNotification({
      message:
        'Reference updated. Container will apply changes on next restart (active sessions detected).',
      source: 'Workspace',
      type: 'info',
    });
    return;
  }

  try {
    await runtimeManager.destroy(workspaceId);
    const restartedRuntime = await runtimeManager.getRuntime(workspaceId);
    await restartedRuntime.ensure();
    console.log(
      `[workspace] Recreated container for ${workspaceId} with updated references`,
    );
  } catch (err) {
    console.error(`[workspace] Failed to recreate container for ${workspaceId}:`, err);
    showNotification({
      message: 'Failed to recreate container. Changes will apply on next restart.',
      source: 'Workspace',
      type: 'warning',
    });
  }
}
