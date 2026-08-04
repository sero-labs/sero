/**
 * Models IPC handler — session-independent model listing.
 *
 * Provides available models directly from the shared ModelRuntime,
 * without requiring an active agent session. Used by federated
 * app modules (e.g. cron job model picker) via the sero bridge.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { AvailableModelGroup } from '@/types/ipc';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import { buildAvailableModelGroups } from '../core/model-groups';

export function registerModelsHandlers(): void {
  ipcMain.handle(
    IpcChannels.models.list,
    async (): Promise<AvailableModelGroup[]> => {
      const { modelRuntime } = await ensureInfra();
      const available = await modelRuntime.getAvailable();

      return buildAvailableModelGroups(available);
    },
  );
}
