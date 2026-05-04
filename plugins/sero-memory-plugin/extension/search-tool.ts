/**
 * memory_search tool — QMD-powered search across all memory files.
 *
 * Supports three modes:
 *   keyword  (~30ms)  — BM25 full-text search, best for specific terms, #tags, [[links]]
 *   semantic (~2s)    — vector search, finds related concepts with different wording
 *   deep     (~10s)   — hybrid search with reranking
 *
 * Bridged into sero-cli as `sero memory_search --query "..." --mode keyword`.
 * Falls back to install instructions when QMD is unavailable.
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from 'typebox';

import {
  isQmdAvailable,
  initQmd,
  runQmdUpdateNow,
  runSearch,
} from './qmd';
import type { MemorySearchScope } from '../shared/types';
import { formatRankedResults, normalizeSearchScope, rankMultiAnchorResults } from './retrieval';
import { backfillSessionTranscripts } from './session-transcripts';
import { error, errorDetails, info } from './logger';
import {
  markBackfillNoticeShown,
  shouldShowBackfillNotice,
} from './transparency-state';

// ── Parameters ─────────────────────────────────────────────────

const SearchParams = Type.Object({
  query: Type.String({ description: 'Search query' }),
  mode: Type.Optional(
    StringEnum(['keyword', 'semantic', 'deep'] as const),
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Max results (default: 5)' }),
  ),
  scope: Type.Optional(
    StringEnum(['memory', 'sessions', 'all'] as const),
  ),
});

// ── Helpers ─────────────────────────────────────────────────────

function text(t: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text: t }],
    details: {},
    ...(isError && { isError: true }),
  };
}

function noResultsHint(scope: MemorySearchScope, mode: 'keyword' | 'semantic' | 'deep'): string[] {
  const hints = [
    'If this was a conversation-recall request, retry with `--scope sessions` and a shorter query using likely original wording rather than meta words like "remember".',
    'Examples: `joke`, `tell me a joke`, `example`, or the specific topic/person/place the user asked about.',
  ];
  if (scope === 'memory') {
    hints.unshift('This search only covered curated memory files. Use `--scope sessions` for past chat transcripts.');
  }
  if (mode === 'keyword') {
    hints.push('If wording may differ, retry with `--mode semantic` or `--mode deep`.');
  }
  return hints;
}

// ── Register ───────────────────────────────────────────────────

export function registerSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'memory_search',
    label: 'Memory Search',
    description: [
      'Search across long-term memory files and exported session transcripts.',
      'ALWAYS prefer this tool over bash/grep/find when searching for past context, decisions, conversations, or stored knowledge.',
      '',
      'Modes:',
      "- 'keyword' (default, ~30ms): BM25 search. Best for specific terms, #tags, [[links]].",
      "- 'semantic' (~2s): Vector search. Finds related concepts with different wording.",
      "- 'deep' (~10s): Hybrid + reranking. Use when other modes miss.",
      '',
      'Scopes:',
      "- 'all' (default): search memory files and session transcript exports.",
      "- 'memory': search MEMORY.md, USER.md, IDENTITY.md, SCRATCHPAD.md, and daily logs only.",
      "- 'sessions': search exported past conversations only.",
      '',
      'For user questions like "what do you remember", "what did you tell me", "what jokes/examples/advice did you give", or anything about another session, call this tool before answering. Prefer scope: sessions for conversation recall.',
      'Start with one precise query. If the first search already returns a direct answer, answer from it instead of immediately searching again.',
      'Only rephrase or switch modes if the first search misses or is ambiguous. For recall misses, retry with likely original wording and fewer meta words (for example "joke" or "tell me a joke" rather than "what jokes do you remember telling me").',
      'Use #tags and [[links]] in memory content to improve keyword recall.',
    ].join('\n'),
    parameters: SearchParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Re-check on demand in case QMD wasn't ready at session start
      let available = isQmdAvailable();
      if (!available) {
        available = await initQmd();
      }

      if (!available) {
        return text(
          [
            'memory_search requires QMD (@tobilu/qmd) which could not be initialised.',
            '',
            'Ensure the package is installed:',
            '  npm install @tobilu/qmd',
            '',
            'Then restart Sero — QMD will be auto-configured.',
          ].join('\n'),
          true,
        );
      }

      const mode = (params.mode as 'keyword' | 'semantic' | 'deep') ?? 'keyword';
      const limit = (params.limit as number) ?? 5;
      const query = params.query as string;
      const scope = normalizeSearchScope(params.scope as string | undefined);
      const candidateLimit = Math.min(Math.max(limit, 1) * 4, 20);
      let backfillMessage = '';

      try {
        info('memory_search_execute', { mode, scope, limit, queryChars: query.length });
        if (scope === 'sessions' || scope === 'all') {
          const backfill = await backfillSessionTranscripts();
          info('memory_search_backfill', { scope, exported: backfill.exported, skipped: backfill.skipped });
          if (backfill.exported > 0) {
            await runQmdUpdateNow();
            info('memory_search_qmd_update', { reason: 'session_backfill' });
          }
          if (await shouldShowBackfillNotice(backfill.exported, backfill.skipped)) {
            backfillMessage = `Indexed ${backfill.exported} past session${backfill.exported === 1 ? '' : 's'} for conversation recall.`;
            if (ctx.hasUI) {
              ctx.ui.notify(backfillMessage, 'info');
            }
            await markBackfillNoticeShown(backfill.exported, backfill.skipped);
          }
        }

        const { results, needsEmbed } = await runSearch(mode, query, candidateLimit, scope);
        const ranked = rankMultiAnchorResults({
          prompt: query,
          scope,
          variantResults: [{ query, results }],
          limit,
        });

        if (ranked.length === 0) {
          if (needsEmbed && (mode === 'semantic' || mode === 'deep')) {
            return text([
              backfillMessage,
              `No results for "${query}" (mode: ${mode}, scope: ${scope}).`,
              '',
              'QMD reports missing vector embeddings.',
              'Run once, then retry:',
              '  qmd embed',
            ].filter(Boolean).join('\n'));
          }
          return text([
            backfillMessage,
            `No results for "${query}" (mode: ${mode}, scope: ${scope}).`,
            ...noResultsHint(scope, mode),
          ].filter(Boolean).join('\n\n'));
        }

        const formatted = [
          backfillMessage ? `_${backfillMessage}_` : '',
          formatRankedResults(ranked),
        ].filter(Boolean).join('\n\n');

        return {
          content: [{ type: 'text', text: formatted }],
          details: {
            mode,
            query,
            scope,
            count: ranked.length,
            rawCount: results.length,
            needsEmbed,
            backfillMessage: backfillMessage || undefined,
          },
        };
      } catch (err) {
        error('memory_search_failed', {
          mode,
          scope,
          queryChars: query.length,
          ...errorDetails(err),
        });
        return text(
          `memory_search error: ${err instanceof Error ? err.message : String(err)}`,
          true,
        );
      }
    },

    renderCall(args, theme) {
      let t = theme.fg('toolTitle', theme.bold('memory_search '));
      t += theme.fg('dim', `"${args.query}"`);
      if (args.mode && args.mode !== 'keyword') t += ` ${theme.fg('accent', args.mode)}`;
      if (args.scope && args.scope !== 'all') t += ` ${theme.fg('accent', `scope:${args.scope}`)}`;
      return new Text(t, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('memory_search error:') || msg.startsWith('Could not')) {
        return new Text(theme.fg('error', msg.split('\n')[0]!), 0, 0);
      }
      const count = (result.details as Record<string, unknown>)?.count;
      const backfillMessage = (result.details as Record<string, unknown>)?.backfillMessage;
      const scope = (result.details as Record<string, unknown>)?.scope as MemorySearchScope | undefined;
      return new Text(
        theme.fg('success', '✓ ')
          + theme.fg(
            'muted',
            `${count ?? 0} results${scope ? ` (${scope})` : ''}${typeof backfillMessage === 'string' ? ' · indexed' : ''}`,
          ),
        0, 0,
      );
    },
  });
}
