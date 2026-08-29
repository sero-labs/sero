/**
 * Sero FFF search plugin.
 *
 * Registers `find`, `grep`, and `multi_grep` — ranked, paginated, git-aware
 * search backed by the FFF engine (https://github.com/dmtrKovalenko/fff).
 * Sero disables Pi's built-in search tools, so these names are the conventional
 * ones an agent already reaches for.
 *
 * Every session in the process shares one index per effective workspace or
 * worktree root (see registry.ts), searches are confined to that root (see
 * path-policy.ts), and an index that cannot be built degrades to a tool error
 * pointing at `bash` with `rg` rather than blocking the session.
 *
 * Portions adapted from `@ff-labs/pi-fff` (MIT, © Dmitry Kovalenko); see
 * NOTICE.md.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { SearchContext } from './search-context';
import { registerFindTool } from './tools/find';
import { registerGrepTool } from './tools/grep';
import { registerMultiGrepTool } from './tools/multi-grep';

export default function fffSearchExtension(pi: ExtensionAPI): void {
  const search = new SearchContext();

  registerFindTool(pi, search);
  registerGrepTool(pi, search);
  registerMultiGrepTool(pi, search);

  pi.on('session_start', async (_event, ctx) => {
    // Warming here means the first search does not pay for the initial scan.
    // A failure is logged and nothing else: a session must open even when the
    // index cannot be built, and the tools carry the fallback message.
    const warmed = await search.warm(ctx.cwd);
    if (!warmed.ok) {
      console.warn(`[sero-fff] index unavailable for ${ctx.cwd}: ${warmed.error}`);
    }
  });

  pi.on('session_shutdown', async () => {
    search.release();
  });
}
