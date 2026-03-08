/**
 * IPC handlers for the 4-agent collaboration framework.
 *
 * The collaboration prompt handler:
 * 1. Extracts conversation history from the main session for context
 * 2. Runs the 4-agent collaboration (specialists + coordinator)
 * 3. Feeds the synthesized result back through the MAIN agent session
 *    so the conversation is persisted and follow-up queries have context.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { CollaborationEvent } from '../../src/types/collaboration';
import { runCollaboration } from '../collaboration/index';
import { subagentManager } from './shared-infra';
import { getAgentPoolEntry } from './agent';
import { extractOriginalCollaborationQuery } from './collaboration-message';

function sendCollabEvent(event: CollaborationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.collaboration.event, event);
  }
}

/**
 * Extract a concise conversation summary from the main session's messages
 * so specialists have context for follow-up queries.
 *
 * Returns empty string if this is the first message (no history needed).
 */
function extractConversationContext(
  messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>,
): string {
  if (!messages || messages.length === 0) return '';

  // Build a condensed history from the last few turns (max ~6 messages)
  const recent = messages.slice(-6);
  const lines: string[] = [];

  for (const msg of recent) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    const text = msg.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('');

    if (!text) continue;

    // Strip collaboration injection wrappers so specialists see clean queries
    const cleaned = msg.role === 'user' ? extractOriginalCollaborationQuery(text) : text;

    // Truncate long messages to keep context window reasonable
    const truncated = cleaned.length > 1500 ? cleaned.slice(0, 1500) + '…' : cleaned;
    lines.push(`[${role}]: ${truncated}`);
  }

  if (lines.length === 0) return '';

  return `## Prior Conversation Context\nThe following is the recent conversation history. The user's new message below is a follow-up.\n\n${lines.join('\n\n')}\n\n---\n\n`;
}

/**
 * Build the task prompt for specialists, including conversation history
 * when this is a follow-up query.
 */
function buildSpecialistQuery(query: string, conversationContext: string): string {
  if (!conversationContext) return query;
  return `${conversationContext}## Current Query\n${query}`;
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
    ) => {
      if (!subagentManager.isInitialized) {
        sendCollabEvent({ type: 'collab_error', sessionId, error: 'Subagent system not initialized' });
        return;
      }

      sendCollabEvent({ type: 'collab_start', sessionId });

      try {
        // Extract conversation history from the main session so specialists
        // have context for follow-up queries.
        const entry = getAgentPoolEntry(sessionId);
        let conversationContext = '';
        if (entry) {
          conversationContext = extractConversationContext(entry.session.messages as Array<{ role: string; content: Array<{ type: string; text?: string }> }>);
        }

        // Build the contextualised query for specialists
        const specialistQuery = buildSpecialistQuery(query, conversationContext);

        // Run two-phase fan-out: researcher first, then analyst+visionary, then synthesis
        const result = await runCollaboration(
          specialistQuery,
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
            onSpecialistEnd: (role, agentName, response, durationMs, error) => {
              sendCollabEvent({ type: 'collab_specialist_end', sessionId, role, agentName, response, durationMs, error });
            },
          },
        );

        sendCollabEvent({ type: 'collab_end', sessionId, result });

        // Phase 3: Feed the synthesis through the main agent session so the
        // conversation is persisted. The main session's response will stream
        // back through the normal agent event channel.
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
