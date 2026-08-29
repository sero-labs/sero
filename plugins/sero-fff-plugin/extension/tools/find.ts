/**
 * `find` — ranked fuzzy path and glob search.
 *
 * Tool shape and pagination adapted from `@ff-labs/pi-fff` (MIT, © Dmitry
 * Kovalenko); see NOTICE.md. Path handling is Sero's own: constraints are
 * confined to the session workspace instead of spawning auxiliary indexes.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { findCursors } from '../cursors';
import { formatFindOutput, withNotices } from '../format';
import { EXHAUSTIVE_GUIDELINE, RANKED_VS_EXHAUSTIVE, WORKSPACE_GUIDELINE } from '../guidance';
import { buildQuery } from '../path-policy';
import { SearchUnavailableError, type SearchContext } from '../search-context';
import { PATH_DESCRIPTION, EXCLUDE_DESCRIPTION, textResult } from './shared';

export const DEFAULT_FIND_LIMIT = 30;

const FindParams = Type.Object({
  pattern: Type.String({
    description:
      'Fuzzy path query. Matched against the whole workspace-relative path, not just '
      + 'the filename, so "profile" also hits "src/browser/profiles/store.ts". Multiple '
      + 'words narrow the result (AND) and are not order-bound.',
  }),
  path: Type.Optional(Type.String({ description: PATH_DESCRIPTION })),
  exclude: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description: EXCLUDE_DESCRIPTION,
    }),
  ),
  limit: Type.Optional(
    Type.Number({ description: `Max results per page (default ${DEFAULT_FIND_LIMIT})` }),
  ),
  cursor: Type.Optional(
    Type.String({ description: 'Pagination cursor from a previous result' }),
  ),
});

export function registerFindTool(pi: ExtensionAPI, search: SearchContext): void {
  pi.registerTool({
    name: 'find',
    label: 'Find files',
    description:
      `Fuzzy path and glob search over the workspace. Frecency-ranked and git-aware. `
      + `Default limit ${DEFAULT_FIND_LIMIT}. ${RANKED_VS_EXHAUSTIVE}`,
    promptSnippet: 'Find files by path or glob',
    promptGuidelines: [
      'find: matches the WHOLE path, not just the filename. Keep queries to 1-2 terms; extra words narrow.',
      "find: for an exact filename use a glob in `path` (path: '**/profile.ts'); bare patterns are fuzzy.",
      "find: to list a directory, pass path: 'dir/**' with a wildcard pattern rather than pattern alone.",
      'find: use `find` for paths and `grep` for contents.',
      EXHAUSTIVE_GUIDELINE,
      WORKSPACE_GUIDELINE,
    ],
    parameters: FindParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new Error('Operation aborted');

      const resumed = params.cursor ? findCursors.get(params.cursor) : undefined;
      const { finder, root } = await search.finderFor(ctx.cwd);

      const limit = resumed ? resumed.pageSize : Math.max(1, params.limit ?? DEFAULT_FIND_LIMIT);
      const pattern = resumed ? resumed.pattern : params.pattern;
      const query = resumed
        ? resumed.query
        : buildQuery(params.path, params.pattern, params.exclude, root);
      const pageIndex = resumed?.nextPageIndex ?? 0;

      const searchResult = finder.fileSearch(query, { pageIndex, pageSize: limit });
      if (!searchResult.ok) throw new SearchUnavailableError(searchResult.error);

      const result = searchResult.value;
      const formatted = formatFindOutput(result, limit, pattern);

      // The engine fills a page whenever more results exist, so a full page plus
      // an unexhausted total is the signal that another page is available.
      const shownSoFar = pageIndex * limit + result.items.length;
      const hasMore = result.items.length >= limit && result.totalMatched > shownSoFar;

      const notices: string[] = [];
      if (formatted.weak && formatted.shownCount > 0) {
        notices.push(
          `"${pattern}" produced only weak scattered matches, so output is capped at `
          + `${formatted.shownCount}/${result.totalMatched}`,
        );
      }
      if (!formatted.weak && hasMore) {
        const remaining = result.totalMatched - shownSoFar;
        const cursorId = findCursors.put({
          root,
          query,
          pattern,
          pageSize: limit,
          nextPageIndex: pageIndex + 1,
        });
        notices.push(
          `${remaining} more match${remaining === 1 ? '' : 'es'} available; cursor="${cursorId}" to continue`,
        );
      }

      return textResult(withNotices(formatted.output, notices), {
        totalMatched: result.totalMatched,
        totalFiles: result.totalFiles,
        pageIndex,
        hasMore,
      });
    },
  });
}
