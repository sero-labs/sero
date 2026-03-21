/**
 * Git command execution and output parsing.
 *
 * All git operations are run safely via execFileSync
 * in the workspace cwd. Output is parsed into typed structures.
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type {
  BranchInfo,
  CommitNode,
  DiffHunk,
  DiffLine,
  FileChange,
  FileChangeStatus,
  FileDiff,
  RefLabel,
  RemoteInfo,
  StashEntry,
} from '../shared/types';
import { runGit } from './git-exec';

// ── Helpers ─────────────────────────────────────────────────

function git(args: string[], cwd: string): string {
  return runGit(args, cwd, { allowFailure: true });
}

function nonEmpty(line: string): boolean {
  return line.trim().length > 0;
}

function parseStatusChar(code: string): FileChangeStatus | null {
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case '?':
      return 'untracked';
    case 'M':
    case 'T':
    case 'U':
      return 'modified';
    default:
      return null;
  }
}

// ── Commit log ──────────────────────────────────────────────

const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%D';
const LOG_SEP = '\x00';
const RECORD_SEP = '\x01';

export function getCommits(cwd: string, max = 150): CommitNode[] {
  const raw = git([
    'log',
    '--all',
    '--topo-order',
    `--max-count=${max}`,
    `--format=${RECORD_SEP}${LOG_FORMAT}`,
  ], cwd);
  if (!raw) return [];

  return raw
    .split(RECORD_SEP)
    .filter(nonEmpty)
    .map((record) => {
      const fields = record.split(LOG_SEP);
      const refs = parseRefs(fields[7] ?? '');
      return {
        hash: fields[0] ?? '',
        shortHash: fields[1] ?? '',
        parents: (fields[2] ?? '').split(' ').filter(nonEmpty),
        authorName: fields[3] ?? '',
        authorEmail: fields[4] ?? '',
        authorDate: fields[5] ?? '',
        subject: fields[6] ?? '',
        refs,
      };
    });
}

function parseRefs(raw: string): RefLabel[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter(nonEmpty)
    .map((ref) => {
      if (ref.startsWith('HEAD -> ')) {
        return { name: ref.replace('HEAD -> ', ''), type: 'head' as const };
      }
      if (ref.startsWith('tag: ')) {
        return { name: ref.replace('tag: ', ''), type: 'tag' as const };
      }
      if (ref.includes('/')) {
        return { name: ref, type: 'remote' as const };
      }
      return { name: ref, type: 'local' as const };
    });
}

// ── Branches ────────────────────────────────────────────────

export function getBranches(cwd: string): BranchInfo[] {
  const raw = git([
    'for-each-ref',
    '--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(objectname:short)%00%(creatordate:iso-strict)',
    'refs/heads/',
  ], cwd);
  if (!raw) return [];

  return raw.split('\n').filter(nonEmpty).map((line) => {
    const [name, head, upstream, track, hash, date] = line.split('\x00');
    const ahead = parseInt(track?.match(/ahead (\d+)/)?.[1] ?? '0', 10);
    const behind = parseInt(track?.match(/behind (\d+)/)?.[1] ?? '0', 10);
    return {
      name: name ?? '',
      current: head === '*',
      remote: upstream || undefined,
      ahead,
      behind,
      lastCommitHash: hash,
      lastCommitDate: date,
    };
  });
}

// ── Remotes ─────────────────────────────────────────────────

export function getRemotes(cwd: string): RemoteInfo[] {
  const raw = git(['remote', '-v'], cwd);
  if (!raw) return [];

  const map = new Map<string, RemoteInfo>();
  for (const line of raw.split('\n').filter(nonEmpty)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, type] = match;
    if (!name || !url) continue;
    const existing = map.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
    if (type === 'fetch') existing.fetchUrl = url;
    else existing.pushUrl = url;
    map.set(name, existing);
  }
  return Array.from(map.values());
}

// ── File changes (status) ───────────────────────────────────

export function getFileChanges(cwd: string): FileChange[] {
  const raw = git(['status', '--porcelain=v1', '-z'], cwd);
  if (!raw) return [];

  const entries = raw.split('\0');
  const changes: FileChange[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    const x = entry[0] ?? ' ';
    const y = entry[1] ?? ' ';
    const path = entry.substring(3);
    let oldPath: string | undefined;

    if (x === 'R' || x === 'C') {
      oldPath = entries[i + 1] || undefined;
      i += 1;
    }

    if (x === '?' && y === '?') {
      changes.push({ path, status: 'untracked', staged: false });
      continue;
    }

    const stagedStatus = parseStatusChar(x);
    if (stagedStatus) {
      changes.push({ path, oldPath, status: stagedStatus, staged: true });
    }

    const unstagedStatus = parseStatusChar(y);
    if (unstagedStatus) {
      changes.push({ path, oldPath, status: unstagedStatus, staged: false });
    }
  }

  return changes;
}

// ── Stashes ─────────────────────────────────────────────────

export function getStashes(cwd: string): StashEntry[] {
  const raw = git(['stash', 'list', '--format=%H%x00%gd%x00%gs%x00%aI'], cwd);
  if (!raw) return [];

  return raw.split('\n').filter(nonEmpty).map((line, i) => {
    const [hash, , message, date] = line.split('\x00');
    return {
      index: i,
      hash: hash ?? '',
      message: message ?? '',
      date: date ?? '',
    };
  });
}

// ── Diff ────────────────────────────────────────────────────

export function getFileDiff(cwd: string, filePath: string, staged: boolean): FileDiff | null {
  const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
  const raw = git(args, cwd);
  const diff = parseDiffOutput(raw, filePath, staged);
  if (diff) return diff;

  if (!staged && isUntrackedWorktreePath(cwd, filePath)) {
    return createUntrackedFileDiff(cwd, filePath, staged);
  }

  return null;
}

export function getCommitDiff(cwd: string, hash: string): FileDiff[] {
  const raw = git(['diff-tree', '--root', '-p', '--no-commit-id', hash], cwd);
  if (!raw) return [];
  return splitDiffByFile(raw);
}

function parseDiffOutput(raw: string, filePath: string, staged: boolean): FileDiff | null {
  if (!raw) return null;

  const hunks = parseHunks(raw);
  const additions = hunks.reduce((sum, hunk) => {
    return sum + hunk.lines.filter((line) => line.type === 'add').length;
  }, 0);
  const deletions = hunks.reduce((sum, hunk) => {
    return sum + hunk.lines.filter((line) => line.type === 'delete').length;
  }, 0);

  return {
    path: filePath,
    status: inferDiffStatus(raw),
    hunks,
    binary: raw.includes('Binary files') || raw.includes('GIT binary patch'),
    additions,
    deletions,
    staged,
  };
}

function splitDiffByFile(raw: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  const chunks = raw.split(/^diff --git /m).filter(nonEmpty);

  for (const chunk of chunks) {
    const nameMatch = chunk.match(/^a\/(.+?) b\/(.+)/);
    const filePath = nameMatch?.[2] ?? nameMatch?.[1] ?? 'unknown';
    const hunks = parseHunks(chunk);
    const additions = hunks.reduce((sum, hunk) => {
      return sum + hunk.lines.filter((line) => line.type === 'add').length;
    }, 0);
    const deletions = hunks.reduce((sum, hunk) => {
      return sum + hunk.lines.filter((line) => line.type === 'delete').length;
    }, 0);

    fileDiffs.push({
      path: filePath,
      status: inferDiffStatus(chunk),
      hunks,
      binary: chunk.includes('Binary files') || chunk.includes('GIT binary patch'),
      additions,
      deletions,
    });
  }
  return fileDiffs;
}

function inferDiffStatus(raw: string): FileChangeStatus {
  if (raw.includes('new file')) return 'added';
  if (raw.includes('deleted file')) return 'deleted';
  if (raw.includes('rename from')) return 'renamed';
  if (raw.includes('copy from')) return 'copied';
  return 'modified';
}

function isUntrackedWorktreePath(cwd: string, filePath: string): boolean {
  const raw = git(['status', '--porcelain=v1', '--', filePath], cwd);
  return raw.split('\n').some((line) => line.startsWith('?? '));
}

function createUntrackedFileDiff(cwd: string, filePath: string, staged: boolean): FileDiff | null {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    const stats = statSync(absolutePath);
    if (!stats.isFile()) return null;

    const buffer = readFileSync(absolutePath);
    const binary = buffer.includes(0);
    if (binary) {
      return {
        path: filePath,
        status: 'untracked',
        hunks: [],
        binary: true,
        additions: 0,
        deletions: 0,
        staged,
      };
    }

    const lines = splitFileLines(buffer.toString('utf8'));
    return {
      path: filePath,
      status: 'untracked',
      hunks: lines.length > 0
        ? [{
          oldStart: 0,
          oldCount: 0,
          newStart: 1,
          newCount: lines.length,
          lines: lines.map((content, index) => ({
            type: 'add' as const,
            content,
            newLineNo: index + 1,
          })),
        }]
        : [],
      binary: false,
      additions: lines.length,
      deletions: 0,
      staged,
    };
  } catch {
    return null;
  }
}

function splitFileLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function parseHunks(raw: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkMatches = raw.matchAll(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@[^\n]*/g);
  const headers: Array<{
    start: number;
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
  }> = [];

  for (const match of hunkMatches) {
    headers.push({
      start: match.index + match[0].length,
      oldStart: parseInt(match[1], 10),
      oldCount: parseInt(match[2] || '1', 10),
      newStart: parseInt(match[3], 10),
      newCount: parseInt(match[4] || '1', 10),
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const end = i + 1 < headers.length
      ? raw.lastIndexOf('\n@@', headers[i + 1].start)
      : raw.length;
    const body = raw.substring(header.start, end);
    const lines = parseDiffLines(body, header.oldStart, header.newStart);

    hunks.push({
      oldStart: header.oldStart,
      oldCount: header.oldCount,
      newStart: header.newStart,
      newCount: header.newCount,
      lines,
    });
  }
  return hunks;
}

function parseDiffLines(body: string, oldStart: number, newStart: number): DiffLine[] {
  const result: DiffLine[] = [];
  let oldLine = oldStart;
  let newLine = newStart;

  for (const rawLine of body.split('\n')) {
    if (rawLine.startsWith('+')) {
      result.push({ type: 'add', content: rawLine.substring(1), newLineNo: newLine++ });
    } else if (rawLine.startsWith('-')) {
      result.push({ type: 'delete', content: rawLine.substring(1), oldLineNo: oldLine++ });
    } else if (rawLine.startsWith(' ')) {
      result.push({
        type: 'context',
        content: rawLine.substring(1),
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
    }
  }
  return result;
}

// ── Repo info ───────────────────────────────────────────────

export function getCurrentBranch(cwd: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || 'HEAD';
}

export function getHeadHash(cwd: string): string {
  return git(['rev-parse', '--short', 'HEAD'], cwd) || '';
}

export function getRepoName(cwd: string): string {
  const topLevel = git(['rev-parse', '--show-toplevel'], cwd);
  return topLevel ? path.basename(topLevel) : path.basename(cwd);
}

export function isGitRepo(cwd: string): boolean {
  return git(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';
}

export function getCommitCount(cwd: string): number {
  const raw = git(['rev-list', '--count', '--all'], cwd);
  return parseInt(raw, 10) || 0;
}
