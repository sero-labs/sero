/**
 * Session lifecycle hooks — compaction handoff and exit transcript.
 *
 * - session_before_compact: auto-captures recent daily log context as a
 *   handoff entry in today's daily log.
 *   This survives context window resets.
 *
 * - session_shutdown: saves the session transcript for recall.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  resolveMemoryRoot,
  readFile,
  getDailyPath,
  todayStr,
} from './memory-manager';
import { nowTimestamp } from './memory-format';
import { runQmdUpdateNow, clearUpdateTimer } from './qmd';
import { error, errorDetails, info } from './logger';
import { exportTranscriptForSession } from './session-transcripts';

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── Helpers ────────────────────────────────────────────────────

async function appendToDaily(content: string): Promise<void> {
  const root = resolveMemoryRoot();
  const filePath = getDailyPath(root, todayStr());
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const existing = await readFile(filePath);
  const separator = existing?.trim() ? '\n\n' : '';
  await fs.writeFile(filePath, (existing ?? '') + separator + content, 'utf-8');
}

function notifyTranscriptExportFailure(message: string, ctx: {
  hasUI: boolean;
  ui: { notify(message: string, type?: 'info' | 'warning' | 'error'): void };
}): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(message, 'warning');
}

// ── Register hooks ─────────────────────────────────────────────

export function registerSessionLifecycle(pi: ExtensionAPI): void {
  pi.on('session_before_switch', async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    info('session_before_switch_start', {
      reason: event.reason,
      sessionId,
    });
    try {
      const transcript = await exportTranscriptForSession(ctx.sessionManager, `session_before_switch:${event.reason}`);
      info('session_before_switch', {
        reason: event.reason,
        sessionId,
        transcriptChanged: transcript.changed,
        transcriptPath: transcript.path ?? null,
      });
      if (transcript.changed) {
        await runQmdUpdateNow();
      }
    } catch (err) {
      error('session_before_switch_transcript_failed', {
        reason: event.reason,
        ...errorDetails(err),
      });
      notifyTranscriptExportFailure(
        'Conversation recall could not update this session transcript before switching. Search may be stale until the next retry.',
        ctx,
      );
    }
  });

  pi.on('session_before_fork', async (_event, ctx) => {
    try {
      const transcript = await exportTranscriptForSession(ctx.sessionManager, 'session_before_fork');
      info('session_before_fork', {
        transcriptChanged: transcript.changed,
        transcriptPath: transcript.path ?? null,
      });
      if (transcript.changed) {
        await runQmdUpdateNow();
      }
    } catch (err) {
      error('session_before_fork_transcript_failed', errorDetails(err));
      notifyTranscriptExportFailure(
        'Conversation recall could not update this session transcript before forking. Search may be stale until the next retry.',
        ctx,
      );
    }
  });

  // ── Compaction handoff ─────────────────────────────────────

  pi.on('session_before_compact', async () => {
    const parts: string[] = [];

    // Recent daily log context (tail)
    const root = resolveMemoryRoot();
    const todayContent = await readFile(getDailyPath(root, todayStr()));
    if (todayContent?.trim()) {
      const lines = todayContent.trim().split('\n');
      const tail = lines.slice(-15).join('\n');
      parts.push(`**Recent daily log context:**\n${tail}`);
    }

    if (parts.length === 0) return;

    const ts = nowTimestamp();
    const handoff = [
      `<!-- HANDOFF ${ts} -->`,
      '## Session Handoff',
      ...parts,
    ].join('\n');

    await appendToDaily(handoff);
  });

  // ── Exit transcript ────────────────────────────────────────
  // Only the transcript is saved at shutdown. An LLM exit summary used to run
  // here too; it re-summarised unchanged sessions on every quit, spent a model
  // call each time, and was cut off by the host's shutdown timeout.

  pi.on('session_shutdown', async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    info('session_shutdown_start', { sessionId });

    try {
      const transcript = await exportTranscriptForSession(ctx.sessionManager, 'session_shutdown');
      if (transcript.changed) await runQmdUpdateNow();
    } catch (err) {
      error('session_transcript_export_failed', {
        sessionId,
        ...errorDetails(err),
      });
      notifyTranscriptExportFailure(
        'Conversation recall could not save the latest session transcript before shutdown.',
        ctx,
      );
    } finally {
      clearUpdateTimer();
    }
  });
}
