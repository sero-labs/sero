/**
 * Git CLI output parsers.
 *
 * Parses structured output from `git log`, `git status`,
 * `git branch`, `git remote`, and `git diff --name-status`.
 */

import type {
  CommitEntry,
  WorkingCopyStatus,
  StatusFile,
  FileStatus,
  FileDiffEntry,
  Branch,
  Remote,
} from '@sero-ai/common';

// ── Separator used in Git format strings for unambiguous parsing ───

const FIELD_SEP = '\x1f'; // ASCII Unit Separator
const RECORD_SEP = '\x1e'; // ASCII Record Separator

// ── Git Log Format ─────────────────────────────────────────

/**
 * Format string for `git log --format=<format>`.
 * Outputs one record per commit, fields separated by \x1f, records by \x1e.
 *
 * Fields: commitShort, commitFull, authorName, authorEmail, timestamp, subject,
 *         refnames (branches + tags)
 */
export const LOG_FORMAT = [
  '%h',             // abbreviated commit hash
  '%H',             // full commit hash
  '%an',            // author name
  '%ae',            // author email
  '%aI',            // author date (ISO 8601)
  '%s',             // subject (first line)
  '%D',             // ref names (branches, tags)
].join(FIELD_SEP) + RECORD_SEP;

export function parseLogEntries(stdout: string): CommitEntry[] {
  const entries: CommitEntry[] = [];
  const records = stdout.split(RECORD_SEP);

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 7) continue;

    const refNames = fields[6].trim();
    const { branches, tags, isHead } = parseRefNames(refNames);

    entries.push({
      sha: fields[0].trim(),
      fullSha: fields[1].trim().slice(0, 12),
      author: fields[2].trim(),
      email: fields[3].trim(),
      timestamp: fields[4].trim(),
      description: fields[5].trim() || '(no description)',
      empty: false,
      conflict: false,
      immutable: false,
      isWorkingCopy: isHead,
      branches,
      tags,
    });
  }

  return entries;
}

/** Parse git's %D ref decoration into branches and tags. */
function parseRefNames(refNames: string): { branches: string[]; tags: string[]; isHead: boolean } {
  const branches: string[] = [];
  const tags: string[] = [];
  let isHead = false;

  if (!refNames) return { branches, tags, isHead };

  for (const ref of refNames.split(',')) {
    const trimmed = ref.trim();
    if (!trimmed) continue;

    if (trimmed === 'HEAD') {
      isHead = true;
      continue;
    }

    // "HEAD -> main" means HEAD points to branch "main"
    const headArrow = trimmed.match(/^HEAD -> (.+)$/);
    if (headArrow) {
      isHead = true;
      branches.push(headArrow[1].trim());
      continue;
    }

    if (trimmed.startsWith('tag: ')) {
      tags.push(trimmed.slice(5).trim());
      continue;
    }

    // Skip remote tracking refs (origin/main, etc.) — we only show local branches
    if (trimmed.includes('/')) continue;

    branches.push(trimmed);
  }

  return { branches, tags, isHead };
}

// ── Status parser ────────────────────────────────────────────

function parseGitStatusLine(line: string): StatusFile | null {
  if (line.length < 4) return null;

  // Git porcelain v1: "XY path" or "XY old -> new"
  const indexStatus = line[0];
  const workTreeStatus = line[1];
  const rest = line.slice(3);

  // Use the most significant status (index takes priority if staged)
  const code = indexStatus !== ' ' && indexStatus !== '?' ? indexStatus : workTreeStatus;

  const statusMap: Record<string, FileStatus> = {
    M: 'modified',
    A: 'added',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    U: 'conflict',
    '?': 'added', // untracked → treat as added
  };

  const status = statusMap[code] || 'modified';

  // Handle rename: "old -> new"
  if (status === 'renamed' || status === 'copied') {
    const parts = rest.split(' -> ');
    if (parts.length === 2) {
      return { path: parts[1].trim(), status, oldPath: parts[0].trim() };
    }
  }

  return { path: rest.trim(), status };
}

export function parseStatus(stdout: string): WorkingCopyStatus {
  const files: StatusFile[] = [];
  const lines = stdout.split('\n');
  let conflictCount = 0;

  for (const line of lines) {
    if (!line) continue;

    const file = parseGitStatusLine(line);
    if (file) {
      files.push(file);
      if (file.status === 'conflict') conflictCount++;
    }
  }

  return { files, conflictCount, parentShas: [] };
}

// ── Diff summary parser ──────────────────────────────────────

/** Parse output of `git diff --name-status`. */
export function parseDiffSummary(stdout: string): FileDiffEntry[] {
  const entries: FileDiffEntry[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: "M\tpath" or "R100\told\tnew"
    const parts = trimmed.split('\t');
    if (parts.length < 2) continue;

    const code = parts[0].charAt(0);
    const statusMap: Record<string, FileStatus> = {
      M: 'modified',
      A: 'added',
      D: 'deleted',
      R: 'renamed',
      C: 'copied',
      U: 'conflict',
    };
    const status = statusMap[code] || 'modified';

    if ((status === 'renamed' || status === 'copied') && parts.length >= 3) {
      entries.push({ path: parts[2].trim(), status, oldPath: parts[1].trim() });
    } else {
      entries.push({ path: parts[1].trim(), status });
    }
  }

  return entries;
}

// ── Branch parser ────────────────────────────────────────────

/**
 * Format string for `git branch --format=<format>`.
 * For local branches.
 */
export const BRANCH_FORMAT =
  `%(refname:short)${FIELD_SEP}%(objectname:short)${FIELD_SEP}%(upstream:short)${FIELD_SEP}%(upstream:track)${RECORD_SEP}`;

export function parseBranches(stdout: string): Branch[] {
  const branches: Branch[] = [];
  const records = stdout.split(RECORD_SEP);

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 2) continue;

    const name = fields[0].trim();
    const commitId = fields[1].trim();
    const upstream = fields[2]?.trim() || '';
    const trackingStatus = fields[3]?.trim() || '';

    if (!name) continue;

    const remoteStatuses: Branch['remoteStatuses'] = [];
    if (upstream) {
      const remoteName = upstream.split('/')[0] || 'origin';
      const synced = !trackingStatus || trackingStatus === '';
      remoteStatuses.push({ remote: remoteName, synced });
    }

    branches.push({
      name,
      sha: commitId,
      isLocal: true,
      remoteStatuses,
    });
  }

  return branches;
}

// ── Remote parser ────────────────────────────────────────────

export function parseRemotes(stdout: string): Remote[] {
  const remoteMap = new Map<string, string>();

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: "name\turl (fetch|push)"
    const match = trimmed.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (match) {
      // Prefer the fetch URL, but any will do
      if (!remoteMap.has(match[1]) || match[3] === 'fetch') {
        remoteMap.set(match[1], match[2]);
      }
    }
  }

  return Array.from(remoteMap, ([name, url]) => ({ name, url }));
}
