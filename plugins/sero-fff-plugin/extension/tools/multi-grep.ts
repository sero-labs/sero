/**
 * `multi_grep` — OR search over several literal patterns.
 *
 * Adapted from `@ff-labs/pi-fff` (MIT, © Dmitry Kovalenko); see NOTICE.md.
 *
 * The engine matches all patterns in one Aho-Corasick pass, so asking for the
 * snake_case, camelCase, and PascalCase spellings of one identifier costs a
 * single call instead of three.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { grepCursors } from '../cursors';
import { clampContext, formatGrepOutput, GREP_CONTEXT_MAX, withNotices } from '../format';
import { EXHAUSTIVE_GUIDELINE, RANKED_VS_EXHAUSTIVE, WORKSPACE_GUIDELINE } from '../guidance';
import { normalizeExcludes, normalizePathConstraint } from '../path-policy';
import type { SearchContext } from '../search-context';
import { DEFAULT_GREP_LIMIT, GREP_PAGE_SIZE_MAX } from './grep';
import { PATH_DESCRIPTION, EXCLUDE_DESCRIPTION, textResult } from './shared';

export const MAX_PATTERNS = 32;

const MultiGrepParams = Type.Object({
  patterns: Type.Array(Type.String(), {
    description:
      'Literal patterns, matched with OR. Include naming-convention variants of the same '
      + 'identifier, for example ["VideoFrame", "video_frame", "VIDEO_FRAME"].',
  }),
  path: Type.Optional(Type.String({ description: PATH_DESCRIPTION })),
  exclude: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description: EXCLUDE_DESCRIPTION,
    }),
  ),
  caseSensitive: Type.Optional(
    Type.Boolean({
      description:
        'Force case-sensitive matching. The default is smart-case: case-insensitive '
        + 'while every pattern is all lowercase.',
    }),
  ),
  context: Type.Optional(
    Type.Number({ description: `Context lines before and after each match (0-${GREP_CONTEXT_MAX})` }),
  ),
  limit: Type.Optional(
    Type.Number({ description: `Max matches (default ${DEFAULT_GREP_LIMIT})` }),
  ),
  cursor: Type.Optional(
    Type.String({ description: 'Pagination cursor from a previous result' }),
  ),
});

export function registerMultiGrepTool(pi: ExtensionAPI, search: SearchContext): void {
  pi.registerTool({
    name: 'multi_grep',
    label: 'Multi-pattern grep',
    description:
      'Search file contents for ANY of several literal patterns in one pass. Use it for '
      + 'naming-convention variants and related identifiers instead of repeated greps. '
      + `Default limit ${DEFAULT_GREP_LIMIT}. ${RANKED_VS_EXHAUSTIVE}`,
    promptSnippet: 'Multi-pattern OR content search',
    promptGuidelines: [
      'multi_grep: use it when several identifiers answer the same question; one call beats three greps.',
      'multi_grep: patterns are literal, never regex. Narrow files with path and exclude.',
      EXHAUSTIVE_GUIDELINE,
      WORKSPACE_GUIDELINE,
    ],
    parameters: MultiGrepParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new Error('Operation aborted');

      const patterns = (params.patterns ?? []).map((pattern) => pattern.trim()).filter(Boolean);
      if (patterns.length === 0) {
        throw new Error('multi_grep needs at least one non-empty pattern.');
      }
      if (patterns.length > MAX_PATTERNS) {
        throw new Error(`multi_grep accepts at most ${MAX_PATTERNS} patterns.`);
      }

      const { finder, root } = await search.finderFor(ctx.cwd);
      const limit = Math.max(1, params.limit ?? DEFAULT_GREP_LIMIT);
      const pageSize = Math.min(limit, GREP_PAGE_SIZE_MAX);

      // multiGrep takes file constraints separately from the patterns, so the
      // include and exclude tokens are assembled without a pattern term.
      const constraintParts: string[] = [];
      if (params.path) {
        const normalized = normalizePathConstraint(params.path, root);
        if (normalized) constraintParts.push(normalized);
      }
      constraintParts.push(...normalizeExcludes(params.exclude, root));

      const result = finder.multiGrep({
        patterns,
        constraints: constraintParts.length > 0 ? constraintParts.join(' ') : undefined,
        maxMatchesPerFile: pageSize,
        pageSize,
        smartCase: params.caseSensitive !== true,
        cursor: (params.cursor ? grepCursors.get(params.cursor) : null) ?? null,
        beforeContext: clampContext(params.context),
        afterContext: clampContext(params.context),
      });
      if (!result.ok) throw new Error(result.error);

      const notices: string[] = [];
      if (result.value.nextCursor) {
        notices.push(
          `More matches available; cursor="${grepCursors.put(result.value.nextCursor)}" to continue`,
        );
      }

      return textResult(withNotices(formatGrepOutput(result.value), notices), {
        totalMatched: result.value.totalMatched,
        totalFiles: result.value.totalFiles,
        patterns,
      });
    },
  });
}
