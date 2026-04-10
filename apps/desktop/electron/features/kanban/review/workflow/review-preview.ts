import type { Card } from '@electron/features/kanban/core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import { startManagedDevServer } from '@electron/features/kanban/implementation/dev-server-launch';
import { detectDevServerCommand } from '@electron/features/kanban/quality/verification';
import type { DevServer } from '@/types/ipc';
import { containerManager } from '@electron/features/container/core/singleton';
import { workspaceManager } from '@electron/features/workspace/manager';

export interface ReviewPreviewResult {
  previewServerId?: string;
  previewUrl?: string;
  reason?: string;
}

export interface ReviewPreviewCleanupResult {
  removedServerIds: string[];
  reason?: string;
}

interface ReviewPreviewDeps {
  detectDevCommand?: (worktreePath: string) => Promise<string | null>;
  isContainerEnabled?: (workspaceId: string) => Promise<boolean>;
  startDevServer?: (options: {
    workspaceId: string;
    workspacePath: string;
    cwdPath: string;
    command: string;
    name: string;
    scope: DevServer['scope'];
    cardId: string;
    logPath: string;
  }) => Promise<{ serverId?: string; url?: string; reason?: string }>;
  listServers?: (workspaceId: string) => DevServer[];
  stopServer?: (serverId: string) => Promise<boolean>;
  unregisterServer?: (serverId: string) => boolean;
}

export async function startCardReviewPreview(
  workspaceId: string,
  workspacePath: string,
  card: Pick<Card, 'id' | 'title'>,
  worktreePath: string,
  tracker?: Pick<ReviewProgressTracker, 'setPhase' | 'flush' | 'addLogLine'>,
  deps: ReviewPreviewDeps = {},
): Promise<ReviewPreviewResult> {
  const detectDevCommand = deps.detectDevCommand ?? detectDevServerCommand;
  const isContainerEnabled = deps.isContainerEnabled ?? ((id: string) => workspaceManager.isContainerEnabled(id));
  const startDevServer = deps.startDevServer ?? startManagedDevServer;

  const cleaned = await cleanupCardReviewPreview(workspaceId, card.id, deps);
  if (cleaned.reason) {
    return { reason: cleaned.reason };
  }

  const command = await detectDevCommand(worktreePath);
  if (!command) {
    return { reason: 'No dev server command detected for preview.' };
  }

  if (!(await isContainerEnabled(workspaceId))) {
    return { reason: 'Workspace is not container-enabled; skipped preview startup.' };
  }

  tracker?.setPhase('Starting preview server');
  await tracker?.flush?.();

  const preview = await startDevServer({
    workspaceId,
    workspacePath,
    cwdPath: worktreePath,
    command,
    name: `Card #${card.id} Preview`,
    scope: 'card-preview',
    cardId: card.id,
    logPath: `/tmp/sero-review-preview-card-${card.id}.log`,
  });
  if (!preview.serverId || !preview.url) {
    return {
      reason: preview.reason ?? 'Preview server failed to start.',
    };
  }

  tracker?.addLogLine?.(`Preview ready at ${preview.url}`);
  return {
    previewServerId: preview.serverId,
    previewUrl: preview.url,
  };
}

export async function cleanupCardReviewPreview(
  workspaceId: string,
  cardId: string,
  deps: ReviewPreviewDeps = {},
): Promise<ReviewPreviewCleanupResult> {
  const listServers = deps.listServers ?? ((id: string) => containerManager.devServers.list(id));
  const stopServer = deps.stopServer ?? ((serverId: string) => containerManager.devServers.stop(serverId));
  const unregisterServer = deps.unregisterServer ?? ((serverId: string) => containerManager.devServers.unregister(serverId));
  const previewServers = listServers(workspaceId).filter(
    (server) => server.scope === 'card-preview' && server.cardId === cardId,
  );

  const removedServerIds: string[] = [];
  for (const server of previewServers) {
    const stopped = server.status === 'stopped' ? true : await stopServer(server.id);
    if (!stopped) {
      return {
        removedServerIds,
        reason: `Failed to stop preview server ${server.id}.`,
      };
    }
    unregisterServer(server.id);
    removedServerIds.push(server.id);
  }

  return { removedServerIds };
}
