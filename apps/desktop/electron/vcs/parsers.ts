/**
 * JJ CLI output parsers.
 *
 * Parses structured template output from `jj log`, `jj status`,
 * `jj bookmark list`, `jj git remote list`, and `jj diff --summary`.
 */

import type {
  ChangeEntry,
  WorkingCopyStatus,
  StatusFile,
  FileStatus,
  FileDiffEntry,
  Bookmark,
  Remote,
  OperationEntry,
} from '../../src/types/vcs';

// ── Separator used in JJ templates for unambiguous parsing ───

const FIELD_SEP = '\x1f'; // ASCII Unit Separator
const RECORD_SEP = '\x1e'; // ASCII Record Separator

// ── JJ Log Template ─────────────────────────────────────────

/**
 * Template string for `jj log --no-graph -T <template>`.
 * Outputs one record per revision, fields separated by \x1f, records by \x1e.
 */
export const LOG_TEMPLATE = [
  'change_id.short(12)',
  'commit_id.short(12)',
  'author.name()',
  'author.email()',
  'author.timestamp().utc().format("%Y-%m-%dT%H:%M:%SZ")',
  'description.first_line()',
  'empty',
  'conflict',
  'immutable',
  'if(self.current_working_copy(), "true", "false")',
  'bookmarks.map(|b| b.name()).join(",")',
  'tags.map(|t| t.name()).join(",")',
].join(` ++ "${FIELD_SEP}" ++ `) + ` ++ "${RECORD_SEP}"`;

export function parseLogEntries(stdout: string): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  const records = stdout.split(RECORD_SEP);
  console.log('[vcs-parser] parseLogEntries: %d records, first 500 chars:\n%s', records.length, stdout.slice(0, 500));

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 12) continue;

    entries.push({
      changeId: fields[0].trim(),
      commitId: fields[1].trim(),
      author: fields[2].trim(),
      email: fields[3].trim(),
      timestamp: fields[4].trim(),
      description: fields[5].trim() || '(no description)',
      empty: fields[6].trim() === 'true',
      conflict: fields[7].trim() === 'true',
      immutable: fields[8].trim() === 'true',
      isWorkingCopy: fields[9].trim() === 'true',
      bookmarks: fields[10].trim() ? fields[10].trim().split(',') : [],
      tags: fields[11].trim() ? fields[11].trim().split(',') : [],
    });
  }

  return entries;
}

// ── Status parser ────────────────────────────────────────────

function parseStatusLine(line: string): StatusFile | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // JJ status format:  "M path/to/file" or "A path" or "D path" or "C path"
  // Also: "R {old => new}"
  const match = trimmed.match(/^([MADRC])\s+(.+)$/);
  if (!match) {
    console.log('[vcs-parser] parseStatusLine NO MATCH: %j', trimmed);
    return null;
  }

  const [, code, rest] = match;
  const statusMap: Record<string, FileStatus> = {
    M: 'modified',
    A: 'added',
    D: 'deleted',
    R: 'renamed',
    C: 'conflict',
  };

  const status = statusMap[code] || 'modified';

  // Handle rename: "{old => new}"
  if (status === 'renamed') {
    const renameMatch = rest.match(/\{(.+?)\s+=>\s+(.+?)\}/);
    if (renameMatch) {
      return { path: renameMatch[2].trim(), status, oldPath: renameMatch[1].trim() };
    }
  }

  return { path: rest.trim(), status };
}

export function parseStatus(stdout: string): WorkingCopyStatus {
  const files: StatusFile[] = [];
  const lines = stdout.split('\n');
  let conflictCount = 0;
  const parentChangeIds: string[] = [];
  console.log('[vcs-parser] parseStatus input (%d lines):\n%s', lines.length, stdout.slice(0, 600));

  // Extract parent info from "Working copy  : <id>" or "Parent commit: <id>"
  for (const line of lines) {
    const parentMatch = line.match(/Parent commit:\s+(\S+)/);
    if (parentMatch) {
      parentChangeIds.push(parentMatch[1]);
    }

    const wcMatch = line.match(/Working copy\s+:\s+(\S+)/);
    if (wcMatch) {
      // This is the working copy change, not a parent
    }
  }

  // Parse file status lines (they appear after the header section)
  let inFileSection = false;
  for (const line of lines) {
    if (line.startsWith('Working copy changes:') || line.startsWith('Untracked paths:')) {
      inFileSection = true;
      continue;
    }

    if (inFileSection && line.trim()) {
      const file = parseStatusLine(line);
      if (file) {
        files.push(file);
        if (file.status === 'conflict') conflictCount++;
      }
    }
  }

  return { files, conflictCount, parentChangeIds };
}

// ── Diff summary parser ──────────────────────────────────────

export function parseDiffSummary(stdout: string): FileDiffEntry[] {
  const entries: FileDiffEntry[] = [];
  console.log('[vcs-parser] parseDiffSummary input:\n%s', stdout.slice(0, 600));

  for (const line of stdout.split('\n')) {
    const file = parseStatusLine(line);
    if (file) {
      entries.push({ path: file.path, status: file.status, oldPath: file.oldPath });
    }
  }

  console.log('[vcs-parser] parseDiffSummary result: %d files', entries.length);
  return entries;
}

// ── Bookmark parser ──────────────────────────────────────────

/**
 * Keep bookmark templates compatible with older JJ versions in containers
 * (e.g. 0.28.x), where `json()` and `synced` aren't available.
 */
const BOOKMARK_TEMPLATE = [
  'name',
  'if(remote, remote, "local")',
  // `normal_target` is a keyword in older JJ versions (not a callable).
  'if(normal_target, normal_target.change_id().short(12), "")',
  // `tracked` is available across 0.28+ and helps future sync UX decisions.
  'if(tracked, "true", "false")',
].join(` ++ "${FIELD_SEP}" ++ `) + ` ++ "${RECORD_SEP}"`;

export { BOOKMARK_TEMPLATE };

interface BookmarkAccumulator {
  name: string;
  localChangeId?: string;
  remoteTargets: Array<{ remote: string; changeId: string; tracked: boolean }>;
}

export function parseBookmarks(stdout: string): Bookmark[] {
  const byName = new Map<string, BookmarkAccumulator>();
  const records = stdout.split(RECORD_SEP);

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 3) continue;

    const name = fields[0].trim();
    const remote = fields[1].trim();
    const changeId = fields[2].trim();
    const tracked = fields[3]?.trim() === 'true';
    const isLocal = remote === 'local';

    if (!name) continue;

    const acc = byName.get(name) ?? { name, remoteTargets: [] };
    if (isLocal) {
      acc.localChangeId = changeId || acc.localChangeId || '';
    } else {
      acc.remoteTargets.push({ remote, changeId, tracked });
    }
    byName.set(name, acc);
  }

  const bookmarks: Bookmark[] = [];
  for (const acc of byName.values()) {
    const localChangeId = acc.localChangeId ?? '';
    const fallbackChangeId = acc.remoteTargets[0]?.changeId ?? '';
    const effectiveChangeId = localChangeId || fallbackChangeId;

    const remoteStatuses = acc.remoteTargets.map(({ remote, changeId }) => ({
      remote,
      synced: Boolean(localChangeId) && changeId === localChangeId,
    }));

    bookmarks.push({
      name: acc.name,
      changeId: effectiveChangeId,
      isLocal: Boolean(localChangeId),
      remoteStatuses,
    });
  }

  return bookmarks;
}

// ── Remote parser ────────────────────────────────────────────

export function parseRemotes(stdout: string): Remote[] {
  const remotes: Remote[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: "name url"  (space-separated)
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      remotes.push({ name: parts[0], url: parts.slice(1).join(' ') });
    }
  }

  return remotes;
}

// ── Operation log parser ─────────────────────────────────────

const OP_LOG_TEMPLATE = [
  'self.id().short(12)',
  'self.time().start().utc().format("%Y-%m-%dT%H:%M:%SZ")',
  'self.description().first_line()',
].join(` ++ "${FIELD_SEP}" ++ `) + ` ++ "${RECORD_SEP}"`;

export { OP_LOG_TEMPLATE };

export function parseOperationLog(stdout: string): OperationEntry[] {
  const entries: OperationEntry[] = [];
  const records = stdout.split(RECORD_SEP);

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 3) continue;

    entries.push({
      id: fields[0].trim(),
      timestamp: fields[1].trim(),
      description: fields[2].trim(),
    });
  }

  return entries;
}
