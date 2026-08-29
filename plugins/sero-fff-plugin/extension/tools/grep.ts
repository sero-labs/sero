/**
 * `grep` — indexed content search with smart-case and a fuzzy fallback.
 *
 * Query construction, mode detection, and the fallback behaviour are adapted
 * from `@ff-labs/pi-fff` (MIT, © Dmitry Kovalenko); see NOTICE.md.
 */

import type { GrepCursor } from '@ff-labs/fff-node';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { BoundedCursorStore } from '../cursors';
import { clampContext, formatGrepOutput, GREP_CONTEXT_MAX, withNotices } from '../format';
import { detectGrepMode, isWildcardOnly, pathTargetsFile } from '../grep-mode';
import { EXHAUSTIVE_GUIDELINE, RANKED_VS_EXHAUSTIVE, WORKSPACE_GUIDELINE } from '../guidance';
import { buildQuery } from '../path-policy';
import { SearchUnavailableError, type SearchContext } from '../search-context';
import { PATH_DESCRIPTION, EXCLUDE_DESCRIPTION, textResult } from './shared';

export const DEFAULT_GREP_LIMIT = 20;
export const GREP_PAGE_SIZE_MAX = 50;

interface StoredGrepCursor {
  root: string;
  cursor: GrepCursor;
}

/** Anything slower than this is not an indexed search any more. */
const GREP_TIME_BUDGET_MS = 10_000;

const GrepParams = Type.Object({
  pattern: Type.String({ description: 'Search pattern (literal text or regex)' }),
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
        + 'while the pattern is all lowercase.',
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

export function registerGrepTool(pi: ExtensionAPI, search: SearchContext): void {
  const cursors = new BoundedCursorStore<StoredGrepCursor>('g');

  pi.registerTool({
    name: 'grep',
    label: 'Grep contents',
    description:
      'Search file contents across the workspace index. Smart-case, auto-detects regex '
      + 'versus literal, git-aware. Files are ordered by frecency; matches inside a file '
      + `stay in source order. Default limit ${DEFAULT_GREP_LIMIT}. ${RANKED_VS_EXHAUSTIVE}`,
    promptSnippet: 'Grep file contents',
    promptGuidelines: [
      'grep: prefer bare identifiers as patterns; literal queries are the fastest path.',
      "grep: narrow with path ('src/', '*.ts') and cut noise with exclude ('test/,*.min.js').",
      'grep: set caseSensitive: true only when the case itself matters.',
      'grep: after one or two greps, read the top match instead of grepping again.',
      EXHAUSTIVE_GUIDELINE,
      WORKSPACE_GUIDELINE,
    ],
    parameters: GrepParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new Error('Operation aborted');

      if (isWildcardOnly(params.pattern)) {
        return textResult(
          `Pattern "${params.pattern}" matches every line. grep needs a concrete substring `
          + "or identifier, for example pattern: 'MyClass' or pattern: 'export function'. "
          + 'To read a whole file, use the read tool.',
          { totalMatched: 0, totalFiles: 0 },
        );
      }

      const { finder, root } = await search.finderFor(ctx.cwd);
      const resumed = params.cursor ? cursors.take(params.cursor) : undefined;
      if (resumed && resumed.root !== root) {
        throw new Error('This grep cursor belongs to a different workspace. Start the search again.');
      }
      const limit = Math.max(1, params.limit ?? DEFAULT_GREP_LIMIT);
      // pageSize caps total matches across files; maxMatchesPerFile alone would
      // still let one file fill an entire engine page.
      const pageSize = Math.min(limit, GREP_PAGE_SIZE_MAX);
      const context = clampContext(params.context);
      const query = buildQuery(params.path, params.pattern, params.exclude, root);
      const mode = detectGrepMode(params.pattern);
      const smartCase = params.caseSensitive !== true;

      const first = finder.grep(query, {
        mode,
        smartCase,
        maxMatchesPerFile: pageSize,
        pageSize,
        cursor: resumed?.cursor ?? null,
        beforeContext: context,
        afterContext: context,
        classifyDefinitions: true,
        timeBudgetMs: GREP_TIME_BUDGET_MS,
      });
      if (!first.ok) throw new SearchUnavailableError(first.error);

      let result = first.value;
      let fuzzyNotice: string | null = null;

      // Only for a first page that came back empty AND exhausted: a regex query
      // is intentional, and a timed-out page would only burn more time.
      if (
        result.items.length === 0
        && !result.nextCursor
        && !params.cursor
        && mode !== 'regex'
      ) {
        const fuzzyQuery = pathTargetsFile(params.path) ? params.pattern : query;
        const fuzzy = finder.grep(fuzzyQuery, {
          mode: 'fuzzy',
          smartCase,
          maxMatchesPerFile: pageSize,
          pageSize,
          cursor: null,
          beforeContext: 0,
          afterContext: 0,
          classifyDefinitions: true,
          timeBudgetMs: GREP_TIME_BUDGET_MS,
        });
        if (!fuzzy.ok) throw new SearchUnavailableError(fuzzy.error);
        if (fuzzy.value.items.length > 0) {
          fuzzyNotice = '0 exact matches; showing close fuzzy matches instead';
          result = fuzzy.value;
        }
      }

      const notices: string[] = [];
      if (result.regexFallbackError) {
        notices.push(`Invalid regex (${result.regexFallbackError}); used literal matching`);
      }
      if (result.nextCursor) {
        const cursorId = cursors.put({ root, cursor: result.nextCursor });
        notices.push(`More matches available; cursor="${cursorId}" to continue`);
      }

      const body = withNotices(formatGrepOutput(result), notices);
      return textResult(fuzzyNotice ? `[${fuzzyNotice}]\n${body}` : body, {
        totalMatched: result.totalMatched,
        totalFiles: result.totalFiles,
        mode,
      });
    },
  });
}
