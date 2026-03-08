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
import { Type } from '@sinclair/typebox';

import {
  isQmdAvailable,
  detectQmd,
  runSearch,
  checkCollection,
  setupCollection,
  installInstructions,
} from './qmd';
import type { QmdSearchResult } from './qmd';

// ── Parameters ─────────────────────────────────────────────────

const SearchParams = Type.Object({
  query: Type.String({ description: 'Search query' }),
  mode: Type.Optional(
    StringEnum(['keyword', 'semantic', 'deep'] as const),
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Max results (default: 5)' }),
  ),
});

// ── Helpers ─────────────────────────────────────────────────────

function getResultPath(r: QmdSearchResult): string | undefined {
  return r.path ?? r.file;
}

function getResultText(r: QmdSearchResult): string {
  return r.content ?? r.chunk ?? r.snippet ?? '';
}

function text(t: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text: t }],
    details: {},
    ...(isError && { isError: true }),
  };
}

// ── Register ───────────────────────────────────────────────────

export function registerSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'memory_search',
    label: 'Memory Search',
    description: [
      'Search across all memory files (MEMORY.md, SCRATCHPAD.md, daily logs).',
      'Modes:',
      "- 'keyword' (default, ~30ms): BM25 search. Best for specific terms, #tags, [[links]].",
      "- 'semantic' (~2s): Vector search. Finds related concepts with different wording.",
      "- 'deep' (~10s): Hybrid + reranking. Use when other modes miss.",
      '',
      'If the first search misses, try rephrasing or switching modes.',
      'Use #tags and [[links]] in memory content to improve keyword recall.',
    ].join('\n'),
    parameters: SearchParams,

    async execute(_toolCallId, params) {
      // Re-check on demand in case QMD was installed mid-session
      let available = isQmdAvailable();
      if (!available) {
        available = await detectQmd();
      }

      if (!available) {
        return text(installInstructions(), true);
      }

      // Ensure collection exists
      let hasCol = await checkCollection();
      if (!hasCol) {
        const created = await setupCollection();
        if (created) hasCol = true;
      }
      if (!hasCol) {
        return text(
          'Could not set up QMD sero-memory collection. Check that QMD is working and the memory directory exists.',
          true,
        );
      }

      const mode = (params.mode as 'keyword' | 'semantic' | 'deep') ?? 'keyword';
      const limit = (params.limit as number) ?? 5;
      const query = params.query as string;

      try {
        const { results, stderr } = await runSearch(mode, query, limit);
        const needsEmbed = /need embeddings/i.test(stderr);

        if (results.length === 0) {
          if (needsEmbed && (mode === 'semantic' || mode === 'deep')) {
            return text([
              `No results for "${query}" (mode: ${mode}).`,
              '',
              'QMD reports missing vector embeddings.',
              'Run once, then retry:',
              '  qmd embed',
            ].join('\n'));
          }
          return text(`No results for "${query}" (mode: ${mode}).`);
        }

        const formatted = results
          .map((r, i) => {
            const parts: string[] = [`### Result ${i + 1}`];
            const filePath = getResultPath(r);
            if (filePath) parts.push(`**File:** ${filePath}`);
            if (r.score != null) parts.push(`**Score:** ${r.score}`);
            const resultText = getResultText(r);
            if (resultText) parts.push(`\n${resultText}`);
            return parts.join('\n');
          })
          .join('\n\n---\n\n');

        return {
          content: [{ type: 'text', text: formatted }],
          details: { mode, query, count: results.length, needsEmbed },
        };
      } catch (err) {
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
      return new Text(t, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('memory_search error:') || msg.startsWith('Could not')) {
        return new Text(theme.fg('error', msg.split('\n')[0]!), 0, 0);
      }
      const count = (result.details as Record<string, unknown>)?.count;
      return new Text(
        theme.fg('success', '✓ ') + theme.fg('muted', `${count ?? 0} results`),
        0, 0,
      );
    },
  });
}
