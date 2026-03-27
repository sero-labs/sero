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
import { getOpenScratchpadItems } from './scratchpad';
import { runQmdUpdateNow, clearUpdateTimer } from './qmd';

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

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

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

// ── Register hooks ─────────────────────────────────────────────

export function registerSessionLifecycle(pi: ExtensionAPI): void {
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
    try {
      // Extract conversation messages using the SDK's discriminated union
      const branch = ctx.sessionManager.getBranch();
      const messageEntries = branch.filter(
        (entry): entry is SessionMessageEntry => entry.type === 'message',
      );
      const messages = messageEntries.map((entry) => entry.message);

      if (messages.length === 0) return;
      if (!ctx.model) return;

      const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
      if (!apiKey) return;

      // Serialise and truncate conversation
      const llmMessages = convertToLlm(messages);
      const conversationText = serializeConversation(llmMessages);
      const { text: truncated, truncated: wasTruncated } = truncateText(
        conversationText.trim(),
        SUMMARY_MAX_CHARS,
      );
      if (!truncated) return;

      // Build prompt
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
        { apiKey, reasoningEffort: 'low' },
      );

      const summaryText = response.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();

      const summary = summaryText || buildSummaryFallback('Summary was empty');
      const ts = nowTimestamp();
      const entry = [
        `<!-- ${ts} -->`,
        '## Session Summary (auto)',
        '',
        summary,
      ].join('\n');

      await appendToDaily(entry);
      await runQmdUpdateNow();
    } catch (err) {
      // Best-effort: write fallback
      const ts = nowTimestamp();
      const fallback = buildSummaryFallback(
        err instanceof Error ? err.message : 'unknown error',
      );
      const entry = [
        `<!-- ${ts} -->`,
        '## Session Summary (auto)',
        '',
        fallback,
      ].join('\n');
      await appendToDaily(entry).catch(() => {});
    } finally {
      clearUpdateTimer();
    }
  });
}
