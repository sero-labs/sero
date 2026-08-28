/**
 * Workspace confinement for every path a tool caller supplies.
 *
 * FFF itself is happy to index anywhere, and the upstream `pi-fff` extension
 * spawns auxiliary indexes for absolute paths, `~/`, and parent traversal. Sero
 * agent sessions are scoped to an approved workspace or worktree root, so that
 * behaviour is deliberately NOT carried across: a constraint that leaves the
 * root is rejected here, before it can reach the engine.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveAgentDir } from './paths';

/**
 * Canonical form of a session root. Symlinks are resolved so that a constraint
 * written against the real path and one written against the link both compare
 * against the same string. A path that does not resolve falls back to its
 * lexical form: the indexing attempt then fails with a message that names the
 * root, which is more useful than an ENOENT from here.
 */
export function canonicalRoot(dir: string): string {
  const resolved = path.resolve(dir);
  return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}

/**
 * Roots that are never a workspace and must never be indexed.
 *
 * The filesystem root and the home directory are the cases FFF itself guards
 * behind opt-in flags. The agent directory is Sero's own: short-lived internal
 * sessions (the subagent tool-catalog enumeration, for one) run with it as cwd,
 * and it holds every stored transcript — scanning it would be a large, pointless
 * index nobody asked for.
 */
export function isIndexableRoot(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const resolved = path.resolve(root);
  if (resolved === path.parse(resolved).root) return false;
  if (resolved === path.resolve(os.homedir())) return false;

  const agentDir = path.resolve(resolveAgentDir(env));
  return resolved !== agentDir && !resolved.startsWith(agentDir + path.sep);
}

export class PathOutsideWorkspaceError extends Error {
  constructor(supplied: string, root: string) {
    super(
      `Path "${supplied}" is outside this session's workspace root (${root}). `
        + 'Search tools only cover the workspace. Use bash with rg to read anything outside it.',
    );
    this.name = 'PathOutsideWorkspaceError';
  }
}

/**
 * Normalises one path constraint to a repo-relative FFF constraint.
 *
 * Returns `null` when the constraint means "the whole workspace", so callers
 * can drop it from the query instead of emitting a no-op token.
 *
 * Throws `PathOutsideWorkspaceError` for `~`, absolute paths outside the root,
 * and relative paths that traverse out of it.
 */
export function normalizePathConstraint(supplied: string, root: string): string | null {
  let trimmed = supplied.trim();
  if (!trimmed) return null;

  if (trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    throw new PathOutsideWorkspaceError(supplied, root);
  }

  if (path.isAbsolute(trimmed)) {
    const relative = path.relative(root, trimmed).replaceAll(path.sep, '/');
    if (relative === '') return null;
    if (escapesRoot(relative)) throw new PathOutsideWorkspaceError(supplied, root);
    trimmed = relative;
  }

  trimmed = trimmed.replaceAll('\\', '/');
  if (trimmed === '.' || trimmed === './') return null;
  if (trimmed.startsWith('./')) trimmed = trimmed.slice(2);
  if (trimmed === '**' || trimmed === '**/' || trimmed === '**/*') return null;

  // Traversal is checked on the literal segments: `path.resolve` would collapse
  // `src/../../etc` into a path that no longer looks like an escape, and a glob
  // segment must not be resolved against the filesystem at all.
  if (escapesRoot(trimmed)) throw new PathOutsideWorkspaceError(supplied, root);

  // FFF's glob matcher treats a hidden directory root glob such as `.agents/**`
  // as empty, while the tool contract says it means "inside this directory".
  // Collapse simple trailing recursive globs to a directory prefix and leave
  // real file globs such as `src/**/*.ts` alone.
  const recursiveDir = trimmed.match(/^(.*)\/\*\*(?:\/\*)?$/);
  if (recursiveDir) {
    const dir = recursiveDir[1];
    if (dir && !/[*?[{]/.test(dir)) return `${dir}/`;
  }

  if (trimmed.startsWith('/') || trimmed.endsWith('/')) return trimmed;
  if (/[*?[{]/.test(trimmed)) return trimmed;

  // A bare filename with an extension is a FilePath constraint; anything else
  // is a directory prefix and needs the trailing slash the parser expects.
  const lastSegment = trimmed.split('/').pop() ?? '';
  if (/\.[a-zA-Z][a-zA-Z0-9]{0,9}$/.test(lastSegment)) return trimmed;
  return `${trimmed}/`;
}

function escapesRoot(relativePath: string): boolean {
  if (path.isAbsolute(relativePath)) return true;
  let depth = 0;
  for (const segment of relativePath.split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      depth -= 1;
      if (depth < 0) return true;
      continue;
    }
    depth += 1;
  }
  return false;
}

/**
 * Normalises exclusions into the `!<constraint>` tokens the FFF query parser
 * understands. A leading `!` on the caller's side is optional and stripped so a
 * constraint is never double-negated.
 */
export function normalizeExcludes(
  exclude: string | string[] | undefined,
  root: string,
): string[] {
  if (!exclude) return [];
  const list = Array.isArray(exclude) ? exclude : [exclude];
  const out: string[] = [];
  for (const raw of list) {
    for (const part of raw.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean)) {
      const stripped = part.startsWith('!') ? part.slice(1) : part;
      const normalized = normalizePathConstraint(stripped, root);
      if (normalized) out.push(`!${normalized}`);
    }
  }
  return out;
}

/** Builds the full FFF query string: path constraint, exclusions, then pattern. */
export function buildQuery(
  pathConstraint: string | undefined,
  pattern: string,
  exclude: string | string[] | undefined,
  root: string,
): string {
  const parts: string[] = [];
  if (pathConstraint) {
    const normalized = normalizePathConstraint(pathConstraint, root);
    if (normalized) parts.push(normalized);
  }
  parts.push(...normalizeExcludes(exclude, root));
  parts.push(pattern);
  return parts.join(' ').trim();
}
