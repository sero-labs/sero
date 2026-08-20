import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_COMMON_IGNORES } from '@sero-ai/common';

/**
 * Measure what a build would read, before anything is spent.
 *
 * Bytes matter more than file count: graphify packs files into chunks by
 * *tokens*, so twenty dense markdown files can cost more than two thousand
 * small source files. A count alone reads as "this repo is small" and hides
 * exactly the case that produced a surprising bill.
 *
 * The scan errs towards over-counting. An estimate that is a little high
 * refuses a build that would have been affordable, which the user can override;
 * one that is low approves a build that empties an account.
 */

export interface ScanResult {
  files: number;
  bytes: number;
  /** True when the walk stopped at `maxFiles` — the real tree is larger. */
  truncated: boolean;
}

export interface ScanOptions {
  /** Extra patterns from settings, passed to the CLI as --exclude. */
  exclude: string[];
  /** Stop counting here; a tree this size is refused anyway. */
  maxFiles: number;
}

/** gitignore-style pattern matched against a single path segment. */
function segmentMatcher(pattern: string): (segment: string) => boolean {
  const trimmed = pattern.trim().replace(/\/$/, '');
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return () => false;
  // Anchored and nested patterns ('/build', 'docs/**') are matched by their
  // last meaningful segment: over-matching costs a few uncounted files, while
  // implementing gitignore in full would not change any decision this makes.
  const segment = trimmed.split('/').filter(Boolean).pop() ?? trimmed;
  if (!segment.includes('*')) return (candidate) => candidate === segment;
  const regex = new RegExp(`^${segment.split('*').map(escapeRegex).join('.*')}$`);
  return (candidate) => regex.test(candidate);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

async function readIgnoreFile(root: string, name: string): Promise<string[]> {
  const raw = await readFile(path.join(root, name), 'utf8').catch(() => null);
  return raw === null ? [] : raw.split('\n');
}

/**
 * graphify honours `.gitignore` and `.graphifyignore`; the estimate has to see
 * the same tree the build will, or it prices a repository nobody is indexing.
 */
export async function buildIgnoreMatcher(root: string, exclude: string[]): Promise<(segment: string) => boolean> {
  const patterns = [
    ...WORKSPACE_COMMON_IGNORES,
    ...exclude,
    '.git',
    ...(await readIgnoreFile(root, '.gitignore')),
    ...(await readIgnoreFile(root, '.graphifyignore')),
  ];
  const matchers = patterns.map(segmentMatcher);
  return (segment) => matchers.some((match) => match(segment));
}

export async function scanWorkspace(root: string, options: ScanOptions): Promise<ScanResult> {
  const ignored = await buildIgnoreMatcher(root, options.exclude);
  const result: ScanResult = { files: 0, bytes: 0, truncated: false };
  const queue: string[] = [root];

  while (queue.length > 0) {
    const dir = queue.pop()!;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignored(entry.name)) continue;
      const full = path.join(dir, entry.name);
      // Symlinks are skipped rather than followed: a link into a large tree (or
      // a cycle) would make the estimate meaningless.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (result.files >= options.maxFiles) {
        result.truncated = true;
        return result;
      }
      result.files += 1;
      result.bytes += await stat(full).then((info) => info.size).catch(() => 0);
    }
  }
  return result;
}
