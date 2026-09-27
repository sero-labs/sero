/**
 * Memory Extension — long-term memory for Sero chat sessions.
 *
 * The host loads this plugin only in chat sessions. Subagents, Architect,
 * Rooms and app agents never get memory.
 *
 *   session_start       conversion, index warm-up, tidy-up, recall set rebuild
 *   before_agent_start  session snapshot in the system prompt, on-match recall
 *   session_compact     snapshot rebuild, recall set cleared
 *   session_shutdown    release of the shared index
 *
 * Tools (bridged into sero-cli): memory, scratchpad.
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { requestIsolatedCompletion } from '@sero-ai/extension-runtime';

import { buildBootstrapInstructions, checkBootstrapStatus } from './bootstrap';
import { error, errorDetails } from './logger';
import type { EntryContext } from './memory-entries';
import { registerMemoryTool } from './memory-tool';
import { acquireIndex, releaseIndex } from './qmd-index';
import { recallForTurn, recalledSinceCompaction } from './recall';
import { registerScratchpadTool } from './scratchpad';
import { buildSnapshot, recordSnapshotMetric, type Snapshot } from './snapshot';
import { startTidyUp } from './tidy';

interface SessionMemory {
  /** Entries recalled since the latest compaction. */
  recalled: Set<string>;
  /** The system prompt addition, fixed until the next compaction. */
  snapshot: Promise<Snapshot> | null;
  awaitingBootstrapFollowUp: boolean;
}

function sessionIdOf(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

/** The chat's workspace. A bridged tool call's `cwd` can be a subfolder, so the session's own folder is used. */
function workspaceOf(ctx: ExtensionContext): string {
  return ctx.sessionManager.getCwd();
}

export default function memoryExtension(pi: ExtensionAPI): void {
  const state: SessionMemory = { recalled: new Set(), snapshot: null, awaitingBootstrapFollowUp: false };

  const snapshotFor = (ctx: ExtensionContext): Promise<Snapshot> => {
    if (!state.snapshot) {
      const built = buildSnapshot(workspaceOf(ctx));
      state.snapshot = built;
      built.then((snapshot) => recordSnapshotMetric(sessionIdOf(ctx), snapshot.counts), () => undefined);
    }
    return state.snapshot;
  };

  const entryContextOf = (ctx: ExtensionContext): EntryContext => ({
    sessionId: sessionIdOf(ctx),
    workspaceRoot: workspaceOf(ctx),
    recalled: state.recalled,
  });

  pi.on('session_start', async (_event, ctx) => {
    try {
      state.recalled = recalledSinceCompaction(ctx.sessionManager.getBranch());
      state.snapshot = null;
      const status = await checkBootstrapStatus();
      state.awaitingBootstrapFollowUp = status.needsBootstrap;
      if (status.needsBootstrap) {
        pi.sendMessage(
          { customType: 'memory-bootstrap', content: 'Memory system detected — starting setup.', display: true },
          { triggerTurn: false },
        );
        return;
      }
      void acquireIndex(sessionIdOf(ctx), workspaceOf(ctx));
      // The snapshot waits for the one-time conversion; the tidy-up waits for the snapshot.
      const snapshot = snapshotFor(ctx);
      void snapshot.then(() => startTidyUp({
        workspaceRoot: workspaceOf(ctx),
        model: ctx.model,
        complete: (request) => requestIsolatedCompletion(pi.events, request),
      }), () => undefined);
    } catch (err) {
      await error('session_start_failed', errorDetails(err));
    }
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const status = await checkBootstrapStatus();
    if (status.needsBootstrap) {
      return { systemPrompt: event.systemPrompt + buildBootstrapInstructions(status.existingUserContent) };
    }

    const snapshot = await snapshotFor(ctx);
    let message;
    try {
      // Waits for the index warm-up; without it, recall runs on keywords alone.
      await acquireIndex(sessionIdOf(ctx), workspaceOf(ctx));
      message = await recallForTurn({
        sessionId: sessionIdOf(ctx),
        prompt: event.prompt ?? '',
        workspaceRoot: workspaceOf(ctx),
        recalled: state.recalled,
      });
    } catch (err) {
      // Recall is extra context. A failure must never block the turn.
      await error('recall_failed', errorDetails(err));
    }
    return { systemPrompt: event.systemPrompt + snapshot.text, message };
  });

  pi.on('session_compact', async (_event, ctx) => {
    state.recalled.clear();
    state.snapshot = null;
    void snapshotFor(ctx);
  });

  pi.on('session_shutdown', async (event, ctx) => {
    // A reload ends this copy, but the session goes on and acquires the index again at once.
    if (event.reason === 'reload') return;
    await releaseIndex(sessionIdOf(ctx));
  });

  pi.on('agent_end', async () => {
    if (!state.awaitingBootstrapFollowUp) return;
    const status = await checkBootstrapStatus();
    if (status.needsBootstrap) return;
    state.awaitingBootstrapFollowUp = false;
    pi.sendMessage(
      { customType: '', content: 'Memory is all set — what would you like to work on?', display: true },
      { triggerTurn: false },
    );
  });

  registerMemoryTool(pi, entryContextOf);
  registerScratchpadTool(pi, (ctx) => ({ workspaceRoot: workspaceOf(ctx), sessionId: sessionIdOf(ctx) }));

  pi.registerCommand('memory', {
    description: 'Show memories or manage them (pass instructions inline)',
    handler: async (args) => {
      const instruction = args.trim();
      pi.sendUserMessage(instruction
        ? `Using the memory tool: ${instruction}`
        : 'List all memories using the memory tool.');
    },
  });
}
