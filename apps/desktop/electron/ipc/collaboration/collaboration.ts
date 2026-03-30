/**
 * IPC handlers for the collaboration framework.
 *
 * Supports two strategies:
 * - 'standard' — original 4-agent fan-out (researcher → analyst+visionary → coordinator)
 * - 'debate' — task decomposition → independent analysis → debate rounds → synthesis
 *
 * The handler:
 * 1. Extracts conversation history from the main session for context
 * 2. Runs the selected strategy
 * 3. Feeds the synthesized result back through the MAIN agent session
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { IpcChannels } from '../../../src/types/ipc';
import type {
  CollaborationEvent,
  CollaborationConfig,
  DebateConfig,
} from '../../../src/types/collaboration';
import { DEFAULT_DEBATE_CONFIG } from '../../../src/types/collaboration';
import { runCollaboration } from '../../features/collaboration';
import { runDebateCollaboration } from '../../features/collaboration/debate';
import { subagentManager } from '../../shared/infra/shared-infra';
import { getAgentPoolEntry } from '../agent';
import { extractOriginalCollaborationQuery } from './collaboration-message';
import {
  applyCollaborationRuntimeEvent,
  createCollaborationRuntimeSnapshot,
  getCollaborationRuntimeSnapshot,
  setCollaborationRuntimeSnapshot,
} from './runtime-state';

function sendCollabEvent(event: CollaborationEvent): void {
  applyCollaborationRuntimeEvent(event);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.collaboration.event, event);
  }
}

/**
 * Extract a concise conversation summary from the main session's messages
 * so specialists have context for follow-up queries.
 */
function extractConversationContext(messages: AgentMessage[]): string {
  if (!messages || messages.length === 0) return '';

  const recent = messages.slice(-6);
  const lines: string[] = [];

  for (const msg of recent) {
    if (!('role' in msg) || !('content' in msg)) continue;
    const { role: rawRole, content: rawContent } = msg as { role: string; content: unknown };
    if (rawRole !== 'user' && rawRole !== 'assistant') continue;

    const role = rawRole === 'user' ? 'User' : 'Assistant';
    const contentParts = typeof rawContent === 'string'
      ? [{ type: 'text' as const, text: rawContent }]
      : Array.isArray(rawContent) ? rawContent : [];
    const text = contentParts
      .filter((c): c is { type: 'text'; text: string } =>
        typeof c === 'object' && c !== null && c.type === 'text' && 'text' in c)
      .map((c) => c.text)
      .join('');

    if (!text) continue;

    const cleaned = msg.role === 'user' ? extractOriginalCollaborationQuery(text) : text;
    const truncated = cleaned.length > 1500 ? cleaned.slice(0, 1500) + '…' : cleaned;
    lines.push(`[${role}]: ${truncated}`);
  }

  if (lines.length === 0) return '';
  return `## Prior Conversation Context\nThe following is the recent conversation history. The user's new message below is a follow-up.\n\n${lines.join('\n\n')}\n\n---\n\n`;
}

function buildSpecialistQuery(query: string, conversationContext: string): string {
  if (!conversationContext) return query;
  return `${conversationContext}## Current Query\n${query}`;
}

function buildInjectionPrompt(originalQuery: string, synthesis: string): string {
  return `A multi-agent collaboration team has just analysed the following query and produced a synthesized answer. Present this answer to the user — you may lightly reformulate for clarity or add brief commentary, but preserve the substance. Do NOT mention the collaboration process.

<user-query>${originalQuery}</user-query>

<collaboration-synthesis>
${synthesis}
</collaboration-synthesis>`;
}

export function registerCollaborationHandlers(): void {
  ipcMain.handle(
    IpcChannels.collaboration.getState,
    async (_event, sessionId: string) => getCollaborationRuntimeSnapshot(sessionId),
  );

  ipcMain.handle(
    IpcChannels.collaboration.prompt,
    async (
      _event,
      sessionId: string,
      workspaceId: string,
      query: string,
      config?: CollaborationConfig,
    ) => {
      if (!subagentManager.isInitialized) {
        sendCollabEvent({ type: 'collab_error', sessionId, error: 'Subagent system not initialized' });
        return;
      }

      const strategy = config?.strategy ?? 'standard';
      const debateConfig: DebateConfig = {
        ...DEFAULT_DEBATE_CONFIG,
        ...config?.debate,
      };
      setCollaborationRuntimeSnapshot(
        sessionId,
        createCollaborationRuntimeSnapshot(strategy, debateConfig, query),
      );
      sendCollabEvent({ type: 'collab_start', sessionId, strategy });

      try {
        const entry = getAgentPoolEntry(sessionId);
        let conversationContext = '';
        if (entry) {
          conversationContext = extractConversationContext(entry.session.messages);
        }

        const specialistQuery = buildSpecialistQuery(query, conversationContext);

        let result;

        if (strategy === 'debate') {
          result = await runDebateCollaboration(
            specialistQuery,
            sessionId,
            workspaceId,
            subagentManager,
            debateConfig,
            {
              onDebatePhase: (phase) => {
                sendCollabEvent({ type: 'collab_debate_phase', sessionId, phase });
              },
              onAgentStatus: (agentName, status) => {
                sendCollabEvent({ type: 'collab_debate_agent_status', sessionId, agentName, status });
              },
              onRoundStart: (round, totalRounds, challengerRole, defenderRole) => {
                sendCollabEvent({ type: 'collab_debate_round_start', sessionId, round, totalRounds, challengerRole, defenderRole });
              },
              onRoundEnd: (round, summary, durationMs, challengerRole, defenderRole) => {
                sendCollabEvent({ type: 'collab_debate_round_end', sessionId, round, summary, durationMs, challengerRole, defenderRole });
              },
              onSpecialistStart: (role, agentName) => {
                sendCollabEvent({ type: 'collab_specialist_start', sessionId, role, agentName });
              },
              onSpecialistEnd: (role, agentName, response, durationMs, error) => {
                sendCollabEvent({ type: 'collab_specialist_end', sessionId, role, agentName, response, durationMs, error });
              },
            },
          );
        } else {
          // Standard strategy
          result = await runCollaboration(
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
        }

        sendCollabEvent({ type: 'collab_end', sessionId, result });

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
