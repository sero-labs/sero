/**
 * Session lifecycle hooks — compaction handoff and exit summary.
 *
 * - session_before_compact: auto-captures open scratchpad items +
 *   recent daily log context as a handoff entry in today's daily log.
 *   This survives context window resets.
 *
 * - session_shutdown: generates an LLM-powered session summary
 *   (decisions, lessons, notes, follow-ups) and appends it to the
 *   daily log. Uses reasoning_effort: low for cost control.
 */

import type { ExtensionAPI, SessionMessageEntry } from '@mariozechner/pi-coding-agent';
import { complete, type Message } from '@mariozechner/pi-ai';
import { convertToLlm, serializeConversation } from '@mariozechner/pi-coding-agent';

import {
  resolveMemoryRoot,
  readFile,
  getDailyPath,
  todayStr,
} from './memory-manager';
import { nowTimestamp } from './memory-format';
import { clearDoneScratchpadItems, getOpenScratchpadItems } from './scratchpad';
import { runQmdUpdateNow, clearUpdateTimer } from './qmd';
import { error, errorDetails, info } from './logger';
import { exportTranscriptForSession } from './session-transcripts';

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── Constants ──────────────────────────────────────────────────

const SUMMARY_MAX_CHARS = 80_000;
const SUMMARY_SYSTEM_PROMPT = [
  'You are a session recap assistant.',
  'Read the conversation and extract key decisions, lessons learned, notes, and follow-ups.',
  'Return ONLY markdown in the specified format, without any extra commentary.'
].join('\n');

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

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(-maxChars), truncated: true };
}

function buildSummaryFallback(error?: string): string {
  const note = error ? `- Auto-summary unavailable: ${error}.` : '- Auto-summary unavailable.';
  return [
    '### Decisions', '- None.',
    '### Lessons Learned', '- None.',
    '### Notes', note,
    '### Follow-ups', '- None.',
  ].join('\n');
}

function buildSessionSummaryEntry(summary: string, sessionId: string, timestamp: string): string {
  return [
    `<!-- ${timestamp} -->`,
    '<!-- source: daily-summary -->',
    `<!-- session-id: ${sessionId} -->`,
    '## Session Summary (auto)',
    '',
    summary,
  ].join('\n');
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

    // Open scratchpad items
    const openItems = await getOpenScratchpadItems();
    if (openItems.length > 0) {
      parts.push('**Open scratchpad items:**');
      for (const item of openItems) {
        parts.push(`- [ ] ${item.text}`);
      }
    }

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

  // ── Exit summary ───────────────────────────────────────────

  pi.on('session_shutdown', async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    info('session_shutdown_start', { sessionId });

    // Auto-evict done scratchpad items so the file stays a focused list of
    // open work. Failures here are non-fatal — the next clear_done call (or
    // capacity guard) will catch up.
    try {
      const removed = await clearDoneScratchpadItems();
      if (removed > 0) info('session_shutdown_scratchpad_evicted', { sessionId, removed });
    } catch (err) {
      error('session_shutdown_scratchpad_evict_failed', { sessionId, ...errorDetails(err) });
    }

    try {
      const branch = ctx.sessionManager.getBranch();
      const messageEntries = branch.filter(
        (entry): entry is SessionMessageEntry => entry.type === 'message',
      );
      if (messageEntries.length === 0) return;

      let qmdDirty = false;
      const messages = messageEntries.map((entry) => entry.message);

      try {
        const transcript = await exportTranscriptForSession(ctx.sessionManager, 'session_shutdown');
        qmdDirty = qmdDirty || transcript.changed;
      } catch (err) {
        error('session_transcript_export_failed', {
          sessionId,
          ...errorDetails(err),
        });
        notifyTranscriptExportFailure(
          'Conversation recall could not save the latest session transcript before shutdown.',
          ctx,
        );
      }

      if (ctx.model) {
        try {
          const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
          if (auth.ok && auth.apiKey) {
            const { apiKey, headers } = auth;
            const llmMessages = convertToLlm(messages);
            const conversationText = serializeConversation(llmMessages);
            const { text: truncated, truncated: wasTruncated } = truncateText(
              conversationText.trim(),
              SUMMARY_MAX_CHARS,
            );

            if (truncated) {
              const promptLines = [
                'Review the conversation and extract important decisions, lessons learned, notes, and follow-ups for a daily log.',
                'Return markdown only with these exact headings:',
                '### Decisions',
                '### Lessons Learned',
                '### Notes',
                '### Follow-ups',
                'Use bullet points under each heading. If there is nothing, write "None.".',
              ];
              if (wasTruncated) {
                promptLines.push(
                  `Note: Conversation was truncated to the most recent ${truncated.length} of ${conversationText.length} characters.`,
                );
              }
              promptLines.push('', '<conversation>', truncated, '</conversation>');

              const summaryMessages: Message[] = [{
                role: 'user',
                content: [{ type: 'text', text: promptLines.join('\n') }],
                timestamp: Date.now(),
              }];

              const response = await complete(
                ctx.model,
                { systemPrompt: SUMMARY_SYSTEM_PROMPT, messages: summaryMessages },
                { apiKey, headers, reasoningEffort: 'low' },
              );

              const summaryText = response.content
                .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                .map((c) => c.text)
                .join('\n')
                .trim();

              const summary = summaryText || buildSummaryFallback('Summary was empty');
              await appendToDaily(buildSessionSummaryEntry(summary, sessionId, nowTimestamp()));
              qmdDirty = true;
              info('session_summary_written', { sessionId });
            }
          }
        } catch (err) {
          const fallback = buildSummaryFallback(
            err instanceof Error ? err.message : 'unknown error',
          );
          await appendToDaily(buildSessionSummaryEntry(fallback, sessionId, nowTimestamp())).catch(() => {});
          qmdDirty = true;
          error('session_summary_failed', {
            sessionId,
            ...errorDetails(err),
          });
        }
      }

      if (qmdDirty) {
        await runQmdUpdateNow();
      }
    } finally {
      clearUpdateTimer();
    }
  });
}
