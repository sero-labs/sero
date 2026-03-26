/**
 * Models IPC handler — session-independent model listing.
 *
 * Provides available models directly from the ModelRegistry,
 * without requiring an active agent session. Used by federated
 * app modules (e.g. cron job model picker) via the sero bridge.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { AvailableModelGroup } from '../../../src/types/ipc';
import { ensureInfra } from '../shared-infra';
import {
  providerDisplayName,
  providerLogo,
} from '../agent/agent-helpers';

export function registerModelsHandlers(): void {
  ipcMain.handle(
    IpcChannels.models.list,
    async (): Promise<AvailableModelGroup[]> => {
      const { modelRegistry } = await ensureInfra();

      // Reload auth so newly-added keys are picked up
      modelRegistry.authStorage.reload();
      const available = modelRegistry.getAvailable();

      // Group by provider
      const grouped = new Map<string, typeof available>();
      for (const m of available) {
        const list = grouped.get(m.provider) ?? [];
        list.push(m);
        grouped.set(m.provider, list);
      }

      return [...grouped.entries()].map(([provider, models]) => ({
        provider,
        displayName: providerDisplayName(provider),
        logo: providerLogo(provider),
        models: models.map((m) => ({
          provider: m.provider,
          modelId: m.id,
          name: m.name,
          reasoning: m.reasoning,
        })),
      }));
    },
  );
}
