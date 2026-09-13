import type { OutputCategory } from './category';
import { stripAnsi } from './ansi';

/**
 * A pre-presentation safety net for category rules.
 *
 * A rule that would remove protected text is rejected and the source candidate
 * is kept. The complete candidate is the persisted source; preview truncation
 * is a separate step.
 */

/**
 * A diagnostic line. Assertion failures name a `...Error` class, so a bare
 * whole-word match for `error` misses `AssertionError`.
 */
export const DIAGNOSTIC_LINE = /\b(?:error|warning|warn)s?\b|[A-Za-z]+Error\b/i;
/**
 * A failure header or marker. A header carries content after the word, so a
 * decorative separator that merely contains the word `Failed` is not one.
 */
const FAILURE_LINE = /^\s*(?:FAIL|FAILED)\s+\S|^\s*(?:✕|✗|×|●)\s|panicked\b|^\s*error\b|test\s+\S+\s+\.\.\.\s*FAILED/i;
const SUMMARY_LINE = /test result:|\b\d+\s+(?:passed|failed|skipped|todo)\b/i;
/** A file/line reference needs a path separator, so `Start at 14:54:12` is not one. */
const FILE_LINE = /[^\s:]*[./][^\s:]*:\d+(?::\d+)?/;
/** A run of line-drawing characters: the section separator in test reporters. */
const SEPARATOR_LINE = /^\s*[─━═⎯]{3,}/;

export function isFailureLine(line: string): boolean {
  return FAILURE_LINE.test(line);
}

export function isSummaryLine(line: string): boolean {
  return SUMMARY_LINE.test(line);
}

export function isDiagnosticLine(line: string): boolean {
  return DIAGNOSTIC_LINE.test(line);
}

export function isFileReferenceLine(line: string): boolean {
  return FILE_LINE.test(line);
}

export function isSeparatorLine(line: string): boolean {
  return SEPARATOR_LINE.test(line);
}

const LINT_ISSUE = /^(.+?):(\d+)(?::\d+)?:\s*(.+)$/;
const GIT_DECORATION = /^(?:Author|Date|Merge|AuthorDate|CommitDate):/;
const COMMIT_LINE = /^commit\s+[0-9a-f]{7,40}\b/i;
const PORCELAIN_STATUS_LINE = /^([ MADRCU?]{2})\s+(.+)$/;
const NON_PORCELAIN_STATUS_LINE = /^\s*(?:modified|new file|deleted|renamed|copied|both modified|both added|typechange|untracked):\s+(.+?)(?:\s+->\s+(.+))?$/;
/** A search match line needs a numeric line number; `rg: permission denied` is not a match. */
const SEARCH_LINE = /^(.+?):(\d+):(.*)$/;

function nonEmptyUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function testFragments(source: string): string[] {
  return nonEmptyUnique(
    source.split('\n').filter(
      (line) => FAILURE_LINE.test(line) || SUMMARY_LINE.test(line) || DIAGNOSTIC_LINE.test(line) || FILE_LINE.test(line),
    ),
  );
}

function buildFragments(source: string): string[] {
  return nonEmptyUnique(
    source.split('\n').filter((line) => DIAGNOSTIC_LINE.test(line) || FILE_LINE.test(line)),
  );
}

function lintFragments(source: string): string[] {
  const fragments: string[] = [];
  for (const line of source.split('\n')) {
    const match = line.match(LINT_ISSUE);
    if (match) {
      fragments.push(match[1] ?? '', match[3] ?? '');
      continue;
    }
    // A non-diagnostic line, such as `warning: configuration deprecated`,
    // must survive verbatim.
    if (line.trim()) fragments.push(line.trim());
  }
  return nonEmptyUnique(fragments);
}

function gitFragments(source: string): string[] {
  const fragments: string[] = [];
  for (const line of source.split('\n')) {
    if (COMMIT_LINE.test(line)) {
      fragments.push(line.trim());
      continue;
    }
    if (GIT_DECORATION.test(line)) continue;
    const porcelain = line.match(PORCELAIN_STATUS_LINE);
    if (porcelain) {
      fragments.push(porcelain[2] ?? '');
      continue;
    }
    const nonPorcelain = line.match(NON_PORCELAIN_STATUS_LINE);
    if (nonPorcelain) {
      fragments.push(nonPorcelain[1] ?? '');
      if (nonPorcelain[2]) fragments.push(nonPorcelain[2]);
    }
  }
  return nonEmptyUnique(fragments);
}

function packageManagerFragments(source: string): string[] {
  return nonEmptyUnique(source.split('\n').filter((line) => DIAGNOSTIC_LINE.test(line)));
}

function searchFragments(source: string): string[] {
  const fragments: string[] = [];
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(SEARCH_LINE);
    if (match) {
      fragments.push(match[1] ?? '');
      if ((match[3] ?? '').trim()) fragments.push((match[3] ?? '').trim());
      continue;
    }
    // A diagnostic or any other non-match line must survive verbatim.
    fragments.push(line.trim());
  }
  return nonEmptyUnique(fragments);
}

/** Fragments the category must keep in its complete candidate. */
export function protectedFragments(source: string, category: OutputCategory): string[] {
  // A candidate is ANSI-stripped, so compare against the stripped source.
  const clean = stripAnsi(source);
  switch (category) {
    case 'test':
      return testFragments(clean);
    case 'build':
      return buildFragments(clean);
    case 'lint':
      return lintFragments(clean);
    case 'git':
      return gitFragments(clean);
    case 'packageManager':
      return packageManagerFragments(clean);
    case 'search':
      return searchFragments(clean);
    default:
      return [];
  }
}

/** True when the candidate keeps every protected fragment of the source. */
export function preservesProtectedContent(
  source: string,
  candidate: string,
  category: OutputCategory,
): boolean {
  const fragments = protectedFragments(source, category);
  return fragments.every((fragment) => candidate.includes(fragment));
}

/**
 * Return the candidate only when it preserves the source's protected content.
 *
 * A rejected rule leaves the source text unchanged, so nothing is lost.
 */
export function applyPreservationGuard(
  source: string,
  candidate: string | null,
  category: OutputCategory,
): string {
  if (candidate === null || candidate === source) return source;
  if (source.trim().length > 0 && candidate.trim().length === 0) return source;
  return preservesProtectedContent(source, candidate, category) ? candidate : source;
}
