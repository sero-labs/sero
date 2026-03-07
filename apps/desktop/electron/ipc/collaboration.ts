/**
 * IPC handlers for the 4-agent collaboration framework.
 *
 * The collaboration prompt handler:
 * 1. Runs the 4-agent collaboration (specialists + coordinator)
 * 2. Feeds the synthesized result back through the MAIN agent session
 *    so the conversation is persisted and follow-up queries have context.
 *
 * This means the main session's AgentSession sees the user message and
 * generates a response informed by the collaboration — preserving full
 * session history for follow-ups.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { CollaborationEvent } from '../../src/types/collaboration';
import type { ChatMessage, ChatAttachment } from '../../src/types/ipc';
import { runCollaboration } from '../collaboration/index';
import { subagentManager } from './shared-infra';
import { getAgentPoolEntry } from './agent';

function sendCollabEvent(event: CollaborationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.collaboration.event, event);
  }
}

/**
 * Build a prompt for the main session that includes the collaboration
 * synthesis as context. The main agent will present the result naturally,
 * and the full exchange is persisted to the session file.
 */
function buildInjectionPrompt(originalQuery: string, synthesis: string): string {
  return `A multi-agent collaboration team (Researcher, Analyst, Visionary, Coordinator) has just analysed the following query in parallel and produced a synthesized answer. Present this answer to the user — you may lightly reformulate for clarity or add brief commentary, but preserve the substance. Do NOT mention the collaboration process.

<user-query>${originalQuery}</user-query>

<collaboration-synthesis>
${synthesis}
</collaboration-synthesis>`;
}

export function registerCollaborationHandlers(): void {
  ipcMain.handle(
    IpcChannels.collaboration.prompt,
    async (
      _event,
      sessionId: string,
      workspaceId: string,
      query: string,
      clientMessageId?: string,
    ) => {
      if (!subagentManager.isInitialized) {
        sendCollabEvent({ type: 'collab_error', sessionId, error: 'Subagent system not initialized' });
        return;
      }

      sendCollabEvent({ type: 'collab_start', sessionId });

      try {
        // Phase 1+2: Run specialists in parallel, then coordinator synthesis
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

        // Phase 3: Feed the synthesis through the main agent session so the
        // conversation is persisted. The main session's response will stream
        // back through the normal agent event channel.
        const entry = getAgentPoolEntry(sessionId);
        if (entry) {
          const injectionPrompt = buildInjectionPrompt(query, result.finalResponse);
          await entry.session.prompt(injectionPrompt);
        }

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendCollabEvent({ type: 'collab_error', sessionId, error: msg });
        throw err;
      }
    },
  );
}
