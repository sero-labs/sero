/**
 * Index, message and hook plumbing for the gateway's selected-file commit.
 *
 * `git-ops.ts` builds the commit in a temporary index. These helpers read
 * index and tree entries, keep the temporary files wherever the repository
 * lives, clean the message the way `git commit` would, and bring the real
 * index in line with what was committed.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { runGitAsync } from '@electron/features/git/git-service/git-exec';

/**
 * A pathspec is taken as written. Without this, a file called `*.txt`
 * would match every text file.
 */
export const LITERAL = '--literal-pathspecs';

/** How many `--cacheinfo` or path arguments go into one git call. */
const BATCH = 100;

/** One index or tree entry: the object a path points at, and how. */
export interface Entry {
  mode: string;
  sha: string;
}

/**
 * True when `selected` is `filePath`, or a directory, written with its
 * trailing slash as `git status` reports an untracked one, that holds it.
 * A selected file never covers a path beneath its name.
 */
export function covers(selected: string, filePath: string): boolean {
  return selected === filePath || (selected.endsWith('/') && filePath.startsWith(selected));
}

function sameEntry(a: Entry | undefined, b: Entry | undefined): boolean {
  return a?.mode === b?.mode && a?.sha === b?.sha;
}

/**
 * The index entries under `paths`, keyed by path.
 *
 * `env` selects the index: the real one by default, or a temporary one
 * through `GIT_INDEX_FILE`.
 */
export async function readIndexEntries(
  cwd: string,
  paths: string[],
  env?: Record<string, string>,
): Promise<Map<string, Entry>> {
  const entries = new Map<string, Entry>();
  if (paths.length === 0) return entries;
  const raw = await runGitAsync(
    [LITERAL, 'ls-files', '--stage', '-z', '--', ...paths],
    cwd,
    { trim: false, env },
  );
  for (const line of raw.split('\0')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const [mode, sha] = line.slice(0, tab).split(' ');
    entries.set(line.slice(tab + 1), { mode, sha });
  }
  return entries;
}

/** The entries of `tree` under `paths`, keyed by path. */
export async function readTreeEntries(
  cwd: string,
  tree: string,
  paths: string[],
): Promise<Map<string, Entry>> {
  const entries = new Map<string, Entry>();
  if (paths.length === 0) return entries;
  const raw = await runGitAsync(
    [LITERAL, 'ls-tree', '-r', '-z', tree, '--', ...paths],
    cwd,
    { trim: false },
  );
  for (const line of raw.split('\0')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const [mode, , sha] = line.slice(0, tab).split(' ');
    entries.set(line.slice(tab + 1), { mode, sha });
  }
  return entries;
}

/** True when `commit` is `head` or one of its ancestors. */
async function isReachable(cwd: string, commit: string, head: string): Promise<boolean> {
  try {
    await runGitAsync(['merge-base', '--is-ancestor', commit, head], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Point the real index at what HEAD holds for `paths`, so nothing that
 * was committed shows as still staged, and a file a hook reformatted
 * does not show as a staged reversal.
 *
 * HEAD, not `ours`: a commit made on top of ours since is what the tree
 * should read against now. If HEAD was moved off ours altogether, the
 * index is no longer this commit's to change, and it is left alone.
 *
 * `snapshot` is the real index as it was read before the commit. An entry
 * that no longer matches it was changed by someone else meanwhile, on the
 * desktop say, and is left as they made it. Paths outside the selection
 * are never touched. The read and the write are two git calls, so a
 * change to the index, or a move of HEAD, that lands between them is not
 * seen; the window is a few milliseconds, and git offers no conditional
 * index write to close it.
 */
export async function reconcileIndex(
  cwd: string,
  ours: string,
  paths: string[],
  snapshot: Map<string, Entry>,
): Promise<void> {
  const head = await runGitAsync(['rev-parse', 'HEAD'], cwd);
  if (head !== ours && !(await isReachable(cwd, ours, head))) return;

  const [committed, current] = await Promise.all([
    readTreeEntries(cwd, head, paths),
    readIndexEntries(cwd, paths),
  ]);

  const cacheinfo: string[] = [];
  const remove: string[] = [];
  for (const filePath of new Set([...committed.keys(), ...current.keys(), ...snapshot.keys()])) {
    if (!sameEntry(current.get(filePath), snapshot.get(filePath))) continue;
    const entry = committed.get(filePath);
    if (entry) {
      if (!sameEntry(entry, current.get(filePath))) {
        cacheinfo.push(`${entry.mode},${entry.sha},${filePath}`);
      }
    } else if (current.has(filePath)) {
      remove.push(filePath);
    }
  }

  for (let i = 0; i < cacheinfo.length; i += BATCH) {
    const args = cacheinfo.slice(i, i + BATCH).flatMap((info) => ['--cacheinfo', info]);
    await runGitAsync([LITERAL, 'update-index', '--add', ...args], cwd);
  }
  for (let i = 0; i < remove.length; i += BATCH) {
    await runGitAsync(
      [LITERAL, 'update-index', '--force-remove', '--', ...remove.slice(i, i + BATCH)],
      cwd,
    );
  }
}

/** How `commit.cleanup` says a message is tidied. */
export type CleanupMode = 'verbatim' | 'whitespace' | 'strip' | 'scissors';

/** A `commit.cleanup` value as git reads it; `default` is whitespace without an editor. */
export function cleanupMode(value: string): CleanupMode {
  return value === 'verbatim' || value === 'strip' || value === 'scissors' ? value : 'whitespace';
}

/** The characters `core.commentChar=auto` picks from, in git's order. */
const AUTO_COMMENT_CHARS = '#;@!$%^&|:';

/**
 * The comment character git would use: `auto` picks the first candidate
 * that starts no line of the message, so no line of it reads as a
 * comment, and gives up as git does when every candidate is taken. An
 * empty setting is git's default.
 */
function resolveCommentChar(setting: string, lines: string[]): string {
  if (setting === '') return '#';
  if (setting !== 'auto') return setting;
  const free = [...AUTO_COMMENT_CHARS].find((ch) => !lines.some((line) => line.startsWith(ch)));
  if (!free) {
    throw new Error('Unable to select a comment character that is not used in the current commit message.');
  }
  return free;
}

/**
 * The message as `git commit -m` would record it under `commit.cleanup`:
 * trailing whitespace off every line, no leading or trailing blank lines
 * and no run of them; `strip` drops comment lines too, and `scissors`
 * everything from the scissors line on. `verbatim` changes nothing.
 */
export function cleanMessage(raw: string, mode: CleanupMode = 'whitespace', commentChar = '#'): string {
  if (mode === 'verbatim') return raw;
  let lines = raw.replace(/\r\n/g, '\n').split('\n');
  const comment = resolveCommentChar(commentChar, lines);
  if (mode === 'scissors') {
    const marker = `${comment} ------------------------ >8 ------------------------`;
    const scissors = lines.findIndex((line) => line.trimEnd() === marker);
    if (scissors >= 0) lines = lines.slice(0, scissors);
  }
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (mode !== 'whitespace' && line.startsWith(comment)) continue;
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/**
 * Files the commit keeps in the git dir while it is made: the temporary
 * index and the message the hooks see. Paths are as git printed them,
 * relative to the worktree or absolute.
 */
export interface TempFiles {
  write(filePath: string, content: string): Promise<void>;
  read(filePath: string): Promise<string>;
  remove(filePath: string): Promise<void>;
}

/** The files as the host sees them, under `cwd` when relative. */
export function hostFiles(cwd: string): TempFiles {
  const resolve = (filePath: string) => path.resolve(cwd, filePath);
  return {
    write: (filePath, content) => fs.writeFile(resolve(filePath), content, { encoding: 'utf8', flag: 'wx' }),
    read: (filePath) => fs.readFile(resolve(filePath), 'utf8'),
    remove: (filePath) => fs.rm(resolve(filePath), { force: true }),
  };
}

/**
 * The runtime's view of the files first, the host's second.
 *
 * A container's git dir is a container path the host cannot reach, so
 * the runtime handles it. A linked worktree's git dir lies outside the
 * workspace, where the runtime refuses to go, so the host handles that.
 */
export function withHostFallback(given: TempFiles, host: TempFiles): TempFiles {
  return {
    write: (filePath, content) => given.write(filePath, content).catch(() => host.write(filePath, content)),
    read: (filePath) => given.read(filePath).catch(() => host.read(filePath)),
    remove: async (filePath) => {
      await given.remove(filePath).catch(() => undefined);
      await host.remove(filePath).catch(() => undefined);
    },
  };
}
