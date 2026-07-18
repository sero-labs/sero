import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { OrchestratorBoardAction, OrchestratorBoardActionResult } from '@sero-ai/common';

/**
 * Agent Board → per-workspace orchestrator coordinator. Reads stay on the
 * watched index files; this is the single write path (contract types only).
 */
export const orchestratorBridge = {
  requestAction: (
    workspaceId: string,
    action: OrchestratorBoardAction,
  ): Promise<OrchestratorBoardActionResult> =>
    ipcRenderer.invoke(IpcChannels.orchestrator.action, workspaceId, action),
};
