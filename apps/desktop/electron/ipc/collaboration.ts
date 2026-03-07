/**
 * IPC handlers for the 4-agent collaboration framework.
 *
 * Registers a single `sero:collaboration:prompt` handler that
 * orchestrates the collaboration and pushes lifecycle events
 * to the renderer via `sero:collaboration:event`.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { CollaborationEvent } from '../../src/types/collaboration';
import { runCollaboration } from '../collaboration/index';
import { subagentManager } from './shared-infra';

function sendCollabEvent(event: CollaborationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.collaboration.event, event);
  }
}

export function registerCollaborationHandlers(): void {
  ipcMain.handle(
    IpcChannels.collaboration.prompt,
    async (_event, sessionId: string, workspaceId: string, query: string) => {
      if (!subagentManager.isInitialized) {
        sendCollabEvent({ type: 'collab_error', sessionId, error: 'Subagent system not initialized' });
        return;
      }

      sendCollabEvent({ type: 'collab_start', sessionId });

      try {
        const result = await runCollaboration(
          query,
          sessionId,
          workspaceId,
          subagentManager,
          {
            onPhaseStart: (phase) => {
              sendCollabEvent({ type: 'collab_phase', sessionId, phase });
            },
            onSpecialistStart: (role, agentName) => {
              sendCollabEvent({ type: 'collab_specialist_start', sessionId, role, agentName });
            },
            onSpecialistEnd: (role, agentName, response, error) => {
              sendCollabEvent({ type: 'collab_specialist_end', sessionId, role, agentName, response, error });
            },
          },
        );

        sendCollabEvent({ type: 'collab_end', sessionId, result });
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendCollabEvent({ type: 'collab_error', sessionId, error: msg });
        throw err;
      }
    },
  );
}
