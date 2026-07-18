/**
 * Agent Board → orchestrator coordinator seam.
 *
 * The board (a built-in shell app) reads loop state from each workspace's
 * watched index; writes must reach that workspace's coordinator. Coordinators
 * live in this process, registered on `globalThis` by the orchestrator plugin's
 * runtime (its runtime and extension bundles load through different loaders, so
 * the registry is deliberately a shared global). This handler resolves the
 * coordinator through the cross-plugin contract types in @sero-ai/common —
 * never by importing plugin internals.
 */

import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import {
  getOrchestratorRegistry,
  type OrchestratorBoardAction,
  type OrchestratorBoardActionResult,
} from '@sero-ai/common';

export function registerOrchestratorHandlers(): void {
  ipcMain.handle(
    IpcChannels.orchestrator.action,
    async (_e, workspaceId: string, action: OrchestratorBoardAction): Promise<OrchestratorBoardActionResult> => {
      const entry = getOrchestratorRegistry()?.get(workspaceId);
      if (!entry) {
        return {
          ok: false,
          error: 'No orchestrator is running for this workspace — open the workspace to act on its loops.',
        };
      }
      try {
        const result = await entry.coordinator.requestAction(action);
        return {
          ok: result.ok,
          error: result.error,
          delivered: result.delivered,
          deduped: result.deduped,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
