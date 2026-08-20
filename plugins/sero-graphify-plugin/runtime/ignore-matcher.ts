import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_COMMON_IGNORES } from '@sero-ai/common';

/**
 * gitignore-style matching for the pre-flight scan.
 *
 * The scan decides whether a build is inside its caps, so it must see the same
 * tree the build will. Every mistake here is a mistake about money, and the two
 * directions are not equal: over-counting refuses a build the user can approve
 * anyway, while under-counting approves one that empties an account.
 *
 * So the rule is: **a pattern is applied only when it can be represented
 * exactly.** Anything else is dropped, and its files are counted. A pattern
 * this cannot express must never become a silent exclusion — the earlier
 * segment-only matcher reduced `coverage/**` to `**`, which matched every path
 * and reported an entire repository as zero files and zero cost.
 */

export interface IgnoreMatcher {
  /** True when `relativePath` is excluded from the build. */
  ignores(relativePath: string): boolean;
  /** Patterns that could not be represented, and were therefore not applied. */
  unsupported: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * gitignore glob → regex source. Returns null when the pattern uses syntax this
 * cannot reproduce faithfully, so the caller can drop it rather than guess.
 *
 * Only the three documented forms of `**` span separators: a leading `**\/`, a
 * trailing `/**`, and `/**\/` in the middle. Anywhere else — `foo**bar` — git
 * treats consecutive asterisks as an ordinary `*` that stays inside one
 * segment. Making every `**` recursive excluded `foo/x/bar` for a pattern git
 * would not match, which is another way to under-count a build.
 */
function globToRegexSource(glob: string): string | null {
  // Character classes and negations both change which files are included in
  // ways a naive translation gets wrong.
  if (glob.includes('[') || glob.includes(']')) return null;
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char !== '*') {
      source += char === '?' ? '[^/]' : escapeRegex(char);
      continue;
    }

    let run = 0;
    while (glob[i + run] === '*') run += 1;
    const isDouble = run === 2;
    const atStart = i === 0;
    const atEnd = i + run === glob.length;
    const precededBySlash = glob[i - 1] === '/';
    const followedBySlash = glob[i + run] === '/';

    if (isDouble && (atStart || precededBySlash) && followedBySlash) {
      // `**/` at the start, or `/**/` in the middle: any number of directories.
      source += '(?:.*/)?';
      i += run; // also consume the slash
      continue;
    }
    if (isDouble && precededBySlash && atEnd) {
      // Trailing `/**`: everything beneath. The `/` is already in `source`.
      source += '.*';
      i += run - 1;
      continue;
    }
    // Any other run of asterisks behaves as a single in-segment `*`.
    source += '[^/]*';
    i += run - 1;
  }
  return source;
}

function compile(rawPattern: string): { regex: RegExp } | { unsupported: true } | null {
  const trimmed = rawPattern.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  // A negation re-includes files an earlier pattern excluded. Applying the
  // exclusions without it would under-count, so the whole file is dropped by
  // the caller instead.
  if (trimmed.startsWith('!')) return { unsupported: true };

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const anchored = withoutTrailingSlash.startsWith('/');
  const body = anchored ? withoutTrailingSlash.slice(1) : withoutTrailingSlash;
  if (!body) return null;

  const source = globToRegexSource(body);
  if (source === null) return { unsupported: true };

  // A pattern containing a slash is a path from the workspace root; a bare name
  // matches at any depth. Both also match everything beneath a directory.
  const regex = body.includes('/') || anchored
    ? new RegExp(`^${source}(?:/|$)`)
    : new RegExp(`(?:^|/)${source}(?:/|$)`);
  return { regex };
}

export function createIgnoreMatcher(patternSets: string[][]): IgnoreMatcher {
  const regexes: RegExp[] = [];
  const unsupported: string[] = [];

  for (const patterns of patternSets) {
    const compiled: RegExp[] = [];
    let dropSet = false;
    for (const pattern of patterns) {
      const result = compile(pattern);
      if (result === null) continue;
      if ('unsupported' in result) {
        unsupported.push(pattern.trim());
        // One negation makes every exclusion in that file unsafe to apply on
        // its own, so the whole set is dropped and its files are counted.
        if (pattern.trim().startsWith('!')) dropSet = true;
        continue;
      }
      compiled.push(result.regex);
    }
    if (!dropSet) regexes.push(...compiled);
  }

  return {
    ignores: (relativePath) => regexes.some((regex) => regex.test(relativePath)),
    unsupported,
  };
}

async function readIgnoreFile(root: string, name: string): Promise<string[]> {
  const raw = await readFile(path.join(root, name), 'utf8').catch(() => null);
  return raw === null ? [] : raw.split('\n');
}

/**
 * graphify honours `.gitignore` and `.graphifyignore`; the estimate has to see
 * the same tree the build will, or it prices a repository nobody is indexing.
 */
export async function workspaceIgnoreMatcher(root: string, exclude: string[]): Promise<IgnoreMatcher> {
  return createIgnoreMatcher([
    [...WORKSPACE_COMMON_IGNORES, '.git'],
    exclude,
    await readIgnoreFile(root, '.gitignore'),
    await readIgnoreFile(root, '.graphifyignore'),
  ]);
}
