import type { SeroAppManifest } from '@/types/ipc';
import { broadcastPluginEvent } from '@electron/ipc/integrations/plugin-events';
import { stopPluginDevServer } from './dev-server';
import { applyPluginDevSessionRefreshEffects } from './refresh';
import type { PluginDevSessionRecord } from './types';

export const STOP_PENDING_TASK_GRACE_MS = 3_000;
const STOP_EFFECTS_GRACE_MS = 5_000;

interface StopPluginDevSessionOptions {
  sessionId: string;
  record: PluginDevSessionRecord;
  pendingTask?: Promise<unknown>;
  sessions: Map<string, PluginDevSessionRecord>;
  activeManifests: Map<string, SeroAppManifest>;
  unwatch: (sessionId: string) => void;
  persistSessions: () => void;
}

async function settlesWithin(task: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = task.then(
    () => true,
    () => true,
  );
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const result = await Promise.race([completed, timedOut]);
  if (timer) clearTimeout(timer);
  return result;
}

export async function stopPluginDevSession(options: StopPluginDevSessionOptions): Promise<void> {
  if (options.pendingTask) {
    const settled = await settlesWithin(options.pendingTask, STOP_PENDING_TASK_GRACE_MS);
    if (!settled) {
      console.warn(`[plugin-dev] Stopping ${options.sessionId} without waiting for its stalled refresh.`);
    }
  }

  if (options.sessions.get(options.sessionId) !== options.record) return;

  const activeManifest = options.activeManifests.get(options.sessionId) ?? null;
  options.sessions.delete(options.sessionId);
  options.activeManifests.delete(options.sessionId);
  options.unwatch(options.sessionId);
  options.persistSessions();
  await stopPluginDevServer(options.record.sourcePath);

  if (!activeManifest) return;

  const event = {
    type: 'changed' as const,
    pluginId: activeManifest.id,
    reason: 'dev-session-stopped' as const,
  };
  const effects = Promise.resolve(applyPluginDevSessionRefreshEffects({
    activeManifests: [...options.activeManifests.values()],
    appId: activeManifest.id,
    event: null,
  })).catch((error) => {
    console.warn(`[plugin-dev] Stop cleanup failed for ${options.sessionId}:`, error);
  });
  const effectsSettled = await settlesWithin(effects, STOP_EFFECTS_GRACE_MS);
  if (!effectsSettled) {
    console.warn(`[plugin-dev] Stop cleanup timed out for ${options.sessionId}; the session was still removed.`);
  }
  broadcastPluginEvent(event);
}
