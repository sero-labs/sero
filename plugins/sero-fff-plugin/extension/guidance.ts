/**
 * Shared prompt guidance.
 *
 * FFF is a ranked, paginated discovery engine, not an exhaustive matcher. The
 * distinction has to reach the model, because a silent partial result is worse
 * than no tool at all when the task is an audit or a whole-repository refactor.
 */

export const RANKED_VS_EXHAUSTIVE =
  'Ranked discovery, not exhaustive: results are frecency-ordered and paginated, '
  + 'so a page is the most relevant matches, not every match. Use these tools to '
  + 'explore, navigate, discover symbols, and locate likely implementation files. '
  + 'When you need EVERY occurrence — audits, migrations, security checks, complete '
  + 'refactors — use `bash` with `rg` instead.';

export const EXHAUSTIVE_GUIDELINE =
  'search tools (find/grep/multi_grep): ranked and paginated, not exhaustive. '
  + 'Switch to `bash` with `rg` whenever completeness matters (audits, migrations, '
  + 'security review, repo-wide refactors).';

export const WORKSPACE_GUIDELINE =
  'search tools (find/grep/multi_grep): cover this workspace only. Paths outside it '
  + 'are rejected — read those with `bash`.';
