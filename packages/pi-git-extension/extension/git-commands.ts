/**
 * Git command execution and output parsing.
 *
 * All git operations are run via child_process.execSync
 * in the workspace cwd. Output is parsed into typed structures.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

import type {
  CommitNode, RefLabel, BranchInfo, RemoteInfo,
  FileChange, FileChangeStatus, StashEntry,
  FileDiff, DiffHunk, DiffLine,
} from '../shared/types';

// ── Helpers ─────────────────────────────────────────────────

function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}

function nonEmpty(line: string): boolean {
  return line.trim().length > 0;
}

// ── Commit log ──────────────────────────────────────────────

const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%D';
const LOG_SEP = '\x00';
const RECORD_SEP = '\x01';

export function getCommits(cwd: string, max = 150): CommitNode[] {
  const raw = git(
    `log --all --topo-order --max-count=${max} --format="${RECORD_SEP}${LOG_FORMAT}"`,
    cwd,
  );
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
  return raw.split(',').map((r) => r.trim()).filter(nonEmpty).map((ref) => {
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
  const raw = git(
    'for-each-ref --format="%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(objectname:short)%00%(creatordate:iso-strict)" refs/heads/',
    cwd,
  );
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
  const raw = git('remote -v', cwd);
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

function parseStatusCode(x: string, y: string): { status: FileChangeStatus; staged: boolean } {
  if (x === '?' && y === '?') return { status: 'untracked', staged: false };
  if (x === 'A') return { status: 'added', staged: true };
  if (x === 'D') return { status: 'deleted', staged: true };
  if (x === 'R') return { status: 'renamed', staged: true };
  if (x === 'M') return { status: 'modified', staged: true };
  if (y === 'M') return { status: 'modified', staged: false };
  if (y === 'D') return { status: 'deleted', staged: false };
  if (y === 'A') return { status: 'added', staged: false };
  return { status: 'modified', staged: x !== ' ' };
}

export function getFileChanges(cwd: string): FileChange[] {
  const raw = git('status --porcelain=v1', cwd);
  if (!raw) return [];

  return raw.split('\n').filter(nonEmpty).map((line) => {
    const x = line[0] ?? ' ';
    const y = line[1] ?? ' ';
    const rest = line.substring(3);
    const { status, staged } = parseStatusCode(x, y);

    // Handle renames: "R  old -> new"
    const renameMatch = rest.match(/^(.+) -> (.+)$/);
    if (renameMatch) {
      return { path: renameMatch[2] ?? '', oldPath: renameMatch[1], status, staged };
    }
    return { path: rest, status, staged };
  });
}

// ── Stashes ─────────────────────────────────────────────────

export function getStashes(cwd: string): StashEntry[] {
  const raw = git('stash list --format="%H%x00%gd%x00%gs%x00%aI"', cwd);
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
  const flag = staged ? '--cached' : '';
  const raw = git(`diff ${flag} -- "${filePath}"`, cwd);
  return parseDiffOutput(raw, filePath);
}

export function getCommitDiff(cwd: string, hash: string): FileDiff[] {
  const raw = git(`diff-tree -p --no-commit-id ${hash}`, cwd);
  if (!raw) return [];
  return splitDiffByFile(raw);
}

function parseDiffOutput(raw: string, filePath: string): FileDiff | null {
  if (!raw) return null;

  const hunks = parseHunks(raw);
  const additions = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'add').length, 0);
  const deletions = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'delete').length, 0);

  return {
    path: filePath,
    status: 'modified',
    hunks,
    binary: raw.includes('Binary files'),
    additions,
    deletions,
  };
}

function splitDiffByFile(raw: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  const chunks = raw.split(/^diff --git /m).filter(nonEmpty);

  for (const chunk of chunks) {
    const nameMatch = chunk.match(/^a\/(.+?) b\/(.+)/);
    const filePath = nameMatch?.[2] ?? nameMatch?.[1] ?? 'unknown';
    const hunks = parseHunks(chunk);
    const additions = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'add').length, 0);
    const deletions = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'delete').length, 0);

    let status: FileChangeStatus = 'modified';
    if (chunk.includes('new file')) status = 'added';
    else if (chunk.includes('deleted file')) status = 'deleted';
    else if (chunk.includes('rename from')) status = 'renamed';

    fileDiffs.push({ path: filePath, status, hunks, binary: chunk.includes('Binary'), additions, deletions });
  }
  return fileDiffs;
}

function parseHunks(raw: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkMatches = raw.matchAll(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@[^\n]*/g);

  let lastIndex = 0;
  const hunkHeaders: { start: number; oldStart: number; oldCount: number; newStart: number; newCount: number }[] = [];

  for (const m of hunkMatches) {
    hunkHeaders.push({
      start: m.index + m[0].length,
      oldStart: parseInt(m[1], 10),
      oldCount: parseInt(m[2] || '1', 10),
      newStart: parseInt(m[3], 10),
      newCount: parseInt(m[4] || '1', 10),
    });
    lastIndex = m.index + m[0].length;
  }

  for (let i = 0; i < hunkHeaders.length; i++) {
    const h = hunkHeaders[i];
    const end = i + 1 < hunkHeaders.length ? raw.lastIndexOf('\n@@', hunkHeaders[i + 1].start) : raw.length;
    const body = raw.substring(h.start, end);
    const lines = parseDiffLines(body, h.oldStart, h.newStart);

    hunks.push({
      oldStart: h.oldStart,
      oldCount: h.oldCount,
      newStart: h.newStart,
      newCount: h.newCount,
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
    } else if (rawLine.startsWith(' ') || rawLine === '') {
      result.push({ type: 'context', content: rawLine.substring(1), oldLineNo: oldLine++, newLineNo: newLine++ });
    }
  }
  return result;
}

// ── Repo info ───────────────────────────────────────────────

export function getCurrentBranch(cwd: string): string {
  return git('rev-parse --abbrev-ref HEAD', cwd) || 'HEAD';
}

export function getHeadHash(cwd: string): string {
  return git('rev-parse --short HEAD', cwd) || '';
}

export function getRepoName(cwd: string): string {
  const topLevel = git('rev-parse --show-toplevel', cwd);
  return topLevel ? path.basename(topLevel) : path.basename(cwd);
}

export function isGitRepo(cwd: string): boolean {
  return git('rev-parse --is-inside-work-tree', cwd) === 'true';
}

export function getCommitCount(cwd: string): number {
  const raw = git('rev-list --count --all', cwd);
  return parseInt(raw, 10) || 0;
}
