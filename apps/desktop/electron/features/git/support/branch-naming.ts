/**
 * Branch naming utilities — pure functions for generating conventional
 * branch names from commit descriptions.
 */

const AUTO_PUSH_BRANCH_PREFIX = 'push-';

const CONVENTIONAL_TYPES = new Set([
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf',
  'test', 'build', 'ci', 'chore', 'revert',
]);

export function isAutoPushBranch(name: string): boolean {
  return name.startsWith(AUTO_PUSH_BRANCH_PREFIX);
}

/**
 * Infer a conventional-commit type from a free-form description.
 *
 * 1. Checks for an explicit `type:` or `type(scope):` prefix.
 * 2. Falls back to keyword matching.
 * 3. Defaults to `'chore'`.
 */
export function inferConventionalType(description: string): string {
  const raw = description.trim();
  if (!raw) return 'chore';

  const explicit = raw.match(
    /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:/i,
  );
  if (explicit && CONVENTIONAL_TYPES.has(explicit[1].toLowerCase())) {
    return explicit[1].toLowerCase();
  }

  const lower = raw.toLowerCase();
  if (/\b(fix|bug|error|issue|hotfix|regression)\b/.test(lower)) return 'fix';
  if (/\b(readme|docs?|documentation)\b/.test(lower)) return 'docs';
  if (/\b(test|spec)\b/.test(lower)) return 'test';
  if (/\b(refactor|cleanup|clean up)\b/.test(lower)) return 'refactor';
  if (/\b(perf|performance|optimi[sz]e)\b/.test(lower)) return 'perf';
  if (/\b(build|webpack|vite|rollup|tsconfig)\b/.test(lower)) return 'build';
  if (/\b(ci|pipeline|github actions)\b/.test(lower)) return 'ci';
  if (/\b(add|create|implement|introduce|support)\b/.test(lower)) return 'feat';
  return 'chore';
}

/**
 * Turn a commit description into a URL-safe branch slug.
 *
 * Strips checkpoint/conventional prefixes, lowercases, replaces non-alnum
 * with hyphens, and caps at 48 chars / 8 words.
 */
export function slugifyBranchLabel(description: string): string {
  const withoutCheckpoint = description
    .trim()
    .replace(/^checkpoint:\s*/i, '')
    .replace(
      /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s*/i,
      '',
    );

  const slug = withoutCheckpoint
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!slug) return 'checkpoint';
  return slug.split('-').filter(Boolean).slice(0, 8).join('-').slice(0, 48) || 'checkpoint';
}
