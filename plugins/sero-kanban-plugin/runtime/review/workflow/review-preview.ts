import type { Card } from '../../core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import type {
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeWorkspaceRuntimeResolution,
} from '../../types';
import type { KanbanRuntimeHost } from '../../types';

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
  host: KanbanRuntimeHost;
  detectDevCommand?: (worktreePath: string) => Promise<string | null>;
  resolveRuntime?: (workspaceId: string) => Promise<AppRuntimeWorkspaceRuntimeResolution>;
  startDevServer?: (options: {
    workspaceId: string;
    workspacePath: string;
    cwdPath: string;
    command: string;
    name: string;
    scope: AppRuntimeDevServer['scope'];
    cardId: string;
    logPath: string;
  }) => Promise<AppRuntimeStartManagedDevServerResult>;
  listServers?: (workspaceId: string) => AppRuntimeDevServer[];
  stopServer?: (serverId: string) => Promise<boolean>;
  unregisterServer?: (serverId: string) => boolean;
}

export async function startCardReviewPreview(
  workspaceId: string,
  workspacePath: string,
  card: Pick<Card, 'id' | 'title'>,
  worktreePath: string,
  tracker?: Pick<ReviewProgressTracker, 'setPhase' | 'flush' | 'addLogLine'>,
  deps?: ReviewPreviewDeps,
): Promise<ReviewPreviewResult> {
  if (!deps) {
    throw new Error('Review preview requires host-backed dependencies.');
  }

  const detectDevCommand = deps.detectDevCommand ?? deps.host.verification.detectDevServerCommand;
  const resolveRuntime = deps.resolveRuntime ?? deps.host.workspace.resolveRuntime;
  const startDevServer = deps.startDevServer ?? deps.host.devServers.startManaged;

  const cleaned = await cleanupCardReviewPreview(workspaceId, card.id, deps);
  if (cleaned.reason) {
    return { reason: cleaned.reason };
  }

  const command = await detectDevCommand(worktreePath);
  if (!command) {
    return { reason: 'No dev server command detected for preview.' };
  }

  const runtime = await resolveRuntime(workspaceId);
  if (runtime.actualRuntime !== 'container') {
    return { reason: getManagedDevServerDetail(runtime) };
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
  deps?: ReviewPreviewDeps,
): Promise<ReviewPreviewCleanupResult> {
  if (!deps) {
    throw new Error('Review preview cleanup requires host-backed dependencies.');
  }

  const listServers = deps.listServers ?? deps.host.devServers.list;
  const stopServer = deps.stopServer ?? deps.host.devServers.stop;
  const unregisterServer = deps.unregisterServer ?? deps.host.devServers.unregister;
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

function getManagedDevServerDetail(runtime: AppRuntimeWorkspaceRuntimeResolution): string {
  return runtime.capabilityAudit.find((entry) => entry.key === 'managedDevServers')?.detail
    ?? 'Managed preview/dev-server automation is unavailable for this workspace runtime.';
}
