import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type {
  DiffHunk,
  DiffLine,
  FileChangeStatus,
  FileDiff,
} from '@sero-ai/common';
import { git, nonEmpty } from './git-command-support';
import { getFileChanges } from './git-status-queries';

export function getFileDiff(cwd: string, filePath: string, staged: boolean): FileDiff | null {
  const args = staged ? ['diff', '--cached', '-M', '--', filePath] : ['diff', '-M', '--', filePath];
  const raw = git(args, cwd);
  const statusEntry = getFileChanges(cwd).find((change) => change.path === filePath && change.staged === staged);
  const diff = parseDiffOutput(raw, filePath, staged);
  if (diff) {
    if (statusEntry?.oldPath && !diff.oldPath) diff.oldPath = statusEntry.oldPath;
    if (statusEntry?.status === 'renamed') diff.status = 'renamed';
    if (statusEntry?.status === 'copied') diff.status = 'copied';
    return diff;
  }

  if (!staged && isUntrackedWorktreePath(cwd, filePath)) {
    return createUntrackedFileDiff(cwd, filePath, staged);
  }

  return statusEntry?.status === 'renamed' || statusEntry?.status === 'copied'
    ? {
      path: statusEntry.path,
      oldPath: statusEntry.oldPath,
      status: statusEntry.status,
      hunks: [],
      binary: false,
      additions: 0,
      deletions: 0,
      staged,
    }
    : null;
}

export function getCommitDiff(cwd: string, hash: string): FileDiff[] {
  const raw = git(['diff-tree', '--root', '-M', '-p', '--no-commit-id', hash], cwd);
  if (!raw) return [];
  return splitDiffByFile(raw);
}

function parseDiffOutput(raw: string, filePath: string, staged: boolean): FileDiff | null {
  if (!raw) return null;

  const resolvedPaths = extractDiffPaths(raw, filePath);
  const hunks = parseHunks(raw);
  const additions = hunks.reduce((sum, hunk) => {
    return sum + hunk.lines.filter((line) => line.type === 'add').length;
  }, 0);
  const deletions = hunks.reduce((sum, hunk) => {
    return sum + hunk.lines.filter((line) => line.type === 'delete').length;
  }, 0);

  return {
    path: resolvedPaths.path,
    oldPath: resolvedPaths.oldPath,
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
    const resolvedPaths = extractDiffPaths(chunk, 'unknown');
    const hunks = parseHunks(chunk);
    const additions = hunks.reduce((sum, hunk) => {
      return sum + hunk.lines.filter((line) => line.type === 'add').length;
    }, 0);
    const deletions = hunks.reduce((sum, hunk) => {
      return sum + hunk.lines.filter((line) => line.type === 'delete').length;
    }, 0);

    fileDiffs.push({
      path: resolvedPaths.path,
      oldPath: resolvedPaths.oldPath,
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

function extractDiffPaths(raw: string, fallbackPath: string): { path: string; oldPath?: string } {
  const renameFrom = raw.match(/^rename from (.+)$/m)?.[1];
  const renameTo = raw.match(/^rename to (.+)$/m)?.[1];
  if (renameFrom && renameTo) {
    return { path: renameTo, oldPath: renameFrom };
  }

  const copyFrom = raw.match(/^copy from (.+)$/m)?.[1];
  const copyTo = raw.match(/^copy to (.+)$/m)?.[1];
  if (copyFrom && copyTo) {
    return { path: copyTo, oldPath: copyFrom };
  }

  const diffHeader = raw.match(/^a\/(.+?) b\/(.+)$/m);
  if (diffHeader?.[2]) {
    return {
      path: diffHeader[2],
      oldPath: diffHeader[1] !== diffHeader[2] ? diffHeader[1] : undefined,
    };
  }

  const newPath = raw.match(/^\+\+\+ b\/(.+)$/m)?.[1];
  const oldPath = raw.match(/^--- a\/(.+)$/m)?.[1];
  return {
    path: newPath ?? fallbackPath,
    oldPath: oldPath && oldPath !== newPath ? oldPath : undefined,
  };
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
    if (!header) continue;
    const nextHeader = headers[i + 1];
    const end = nextHeader
      ? raw.lastIndexOf('\n@@', nextHeader.start)
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
