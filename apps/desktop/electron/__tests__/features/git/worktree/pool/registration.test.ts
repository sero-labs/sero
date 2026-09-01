/**
 * Git registration is the authority on which checkouts exist. The parser has
 * to model every record shape Git emits — locked, prunable, detached, bare —
 * because each one means "do not reuse this" for a different reason, and a
 * record silently dropped becomes a directory nobody classified.
 */

import { describe, expect, it } from 'vitest';

import {
  parseWorktreeListing,
  registrationBranch,
} from '@electron/features/git/worktree/pool/registration';

/** `--porcelain -z` terminates every attribute with NUL; a record ends with an extra one. */
function nulListing(records: string[][]): string {
  return records.map((lines) => `${lines.map((line) => `${line}\0`).join('')}\0`).join('');
}

describe('worktree listing parser', () => {
  it('reads path, HEAD and branch from the NUL-delimited format', () => {
    const raw = nulListing([
      ['worktree /repo', 'HEAD aaaa', 'branch refs/heads/main'],
      ['worktree /repo/.sero/worktrees/slot-1', 'HEAD bbbb', 'branch refs/heads/feat/thing'],
    ]);
    const records = parseWorktreeListing(raw, '\0');

    expect(records).toHaveLength(2);
    expect(records[1].path).toBe('/repo/.sero/worktrees/slot-1');
    expect(records[1].head).toBe('bbbb');
    expect(registrationBranch(records[1])).toBe('feat/thing');
  });

  it('keeps a path containing a newline in one record', () => {
    const raw = nulListing([
      ['worktree /repo/odd\nname', 'HEAD aaaa', 'branch refs/heads/main'],
    ]);
    const records = parseWorktreeListing(raw, '\0');

    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('/repo/odd\nname');
  });

  it('models locked, prunable, detached and bare records', () => {
    const raw = nulListing([
      ['worktree /repo', 'bare'],
      ['worktree /a', 'HEAD aaaa', 'detached'],
      ['worktree /b', 'HEAD bbbb', 'branch refs/heads/x', 'locked in use by the installer'],
      ['worktree /c', 'HEAD cccc', 'branch refs/heads/y', 'prunable gitdir file points to non-existent location'],
    ]);
    const [bare, detached, locked, prunable] = parseWorktreeListing(raw, '\0');

    expect(bare.bare).toBe(true);
    expect(detached.detached).toBe(true);
    expect(registrationBranch(detached)).toBeNull();
    expect(locked.locked).toBe(true);
    expect(locked.lockedReason).toBe('in use by the installer');
    expect(prunable.prunable).toBe(true);
    expect(prunable.prunableReason).toBe('gitdir file points to non-existent location');
  });

  it('reads the newline format used by Git versions without -z', () => {
    const raw = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/.sero/worktrees/slot-1',
      'HEAD bbbb',
      'detached',
      '',
    ].join('\n');
    const records = parseWorktreeListing(raw, '\n');

    expect(records.map((record) => record.path)).toEqual(['/repo', '/repo/.sero/worktrees/slot-1']);
    expect(records[1].detached).toBe(true);
  });

  it('drops nothing when the listing has no trailing separator', () => {
    const records = parseWorktreeListing('worktree /repo\0HEAD aaaa\0branch refs/heads/main\0', '\0');
    expect(records).toHaveLength(1);
    expect(registrationBranch(records[0])).toBe('main');
  });
});
