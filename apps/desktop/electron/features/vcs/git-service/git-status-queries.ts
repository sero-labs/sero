import type { FileChange, RemoteInfo, StashEntry } from '@sero-ai/common';
import { git, nonEmpty, parseStatusChar } from './git-command-support';

export async function getRemotes(cwd: string): Promise<RemoteInfo[]> {
  const raw = await git(['remote', '-v'], cwd);
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

export async function getFileChanges(cwd: string): Promise<FileChange[]> {
  const raw = await git(['status', '--porcelain=v1', '-z'], cwd);
  if (!raw) return [];

  const entries = raw.split('\0');
  const changes: FileChange[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    const x = entry[0] ?? ' ';
    const y = entry[1] ?? ' ';
    const filePath = entry.substring(3);
    let oldPath: string | undefined;

    if (x === 'R' || x === 'C') {
      oldPath = entries[i + 1] || undefined;
      i += 1;
    }

    if (x === '?' && y === '?') {
      changes.push({ path: filePath, status: 'untracked', staged: false });
      continue;
    }

    const stagedStatus = parseStatusChar(x);
    if (stagedStatus) {
      changes.push({ path: filePath, oldPath, status: stagedStatus, staged: true });
    }

    const unstagedStatus = parseStatusChar(y);
    if (unstagedStatus) {
      changes.push({ path: filePath, oldPath, status: unstagedStatus, staged: false });
    }
  }

  return changes;
}

export async function getStashes(cwd: string): Promise<StashEntry[]> {
  const raw = await git(['stash', 'list', '--format=%H%x00%gd%x00%gs%x00%aI'], cwd);
  if (!raw) return [];

  return raw.split('\n').filter(nonEmpty).map((line, index) => {
    const [hash, , message, date] = line.split('\x00');
    return {
      index,
      hash: hash ?? '',
      message: message ?? '',
      date: date ?? '',
    };
  });
}
