import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { workspaceIgnoreMatcher } from './ignore-matcher';

/**
 * Measure what a build would read, before anything is spent.
 *
 * Bytes matter more than file count: graphify packs files into chunks by
 * *tokens*, so twenty dense markdown files can cost more than two thousand
 * small source files. A count alone reads as "this repo is small" and hides
 * exactly the case that produced a surprising bill.
 *
 * The scan errs towards over-counting. An estimate that is a little high
 * refuses a build the user can approve anyway; one that is low approves a build
 * that empties an account.
 */

export interface ScanResult {
  files: number;
  bytes: number;
  /** True when the walk stopped at `maxFiles` — the real tree is larger. */
  truncated: boolean;
  /** Ignore patterns that could not be applied exactly, so their files count. */
  unsupportedPatterns: string[];
}

export interface ScanOptions {
  /** Extra patterns from settings, passed to the CLI as --exclude. */
  exclude: string[];
  /** Stop counting here; a tree this size is refused anyway. */
  maxFiles: number;
}

export async function scanWorkspace(root: string, options: ScanOptions): Promise<ScanResult> {
  const matcher = await workspaceIgnoreMatcher(root, options.exclude);
  const result: ScanResult = { files: 0, bytes: 0, truncated: false, unsupportedPatterns: matcher.unsupported };
  // Relative paths, because a gitignore pattern is anchored to the workspace
  // root — matching bare segment names is what let `coverage/**` read as `**`.
  const queue: string[] = [''];

  while (queue.length > 0) {
    const relativeDir = queue.pop()!;
    const absoluteDir = path.join(root, relativeDir);
    const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (matcher.ignores(relativePath)) continue;
      // Symlinks are skipped rather than followed: a link into a large tree (or
      // a cycle) would make the estimate meaningless.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        queue.push(relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (result.files >= options.maxFiles) {
        result.truncated = true;
        return result;
      }
      result.files += 1;
      result.bytes += await stat(path.join(root, relativePath)).then((info) => info.size).catch(() => 0);
    }
  }
  return result;
}
