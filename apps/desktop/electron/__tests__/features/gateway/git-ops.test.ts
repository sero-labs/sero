import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_DIFF_LINES,
  commitChanges,
  readGitDiff,
  readGitStatus,
} from '@electron/ipc/gateway/git-ops';

const dirs: string[] = [];

function run(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** A repository with one commit already in it. */
function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sero-git-ops-'));
  dirs.push(dir);

  run(['init', '-b', 'main'], dir);
  run(['config', 'user.email', 'test@example.com'], dir);
  run(['config', 'user.name', 'Test'], dir);
  writeFileSync(path.join(dir, 'kept.txt'), 'one\ntwo\nthree\n', 'utf8');
  run(['add', '.'], dir);
  run(['commit', '-m', 'first'], dir);

  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0, dirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('readGitStatus', () => {
  it('reports the branch and a clean tree', async () => {
    const status = await readGitStatus(makeRepo());

    expect(status.branch).toBe('main');
    expect(status.files).toEqual([]);
    expect(status.merging).toBe(false);
    expect(status.detached).toBe(false);
  });

  it('reports a modified file as unstaged', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'one\ntwo\nchanged\n', 'utf8');

    const status = await readGitStatus(dir);

    expect(status.files).toEqual([
      { path: 'kept.txt', oldPath: undefined, status: 'modified', staged: false },
    ]);
  });

  it('reports a new file as untracked', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'new.txt'), 'hello\n', 'utf8');

    const status = await readGitStatus(dir);

    expect(status.files.map((file) => file.status)).toEqual(['untracked']);
  });

  it('separates the staged copy from the working tree', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'staged\n', 'utf8');
    run(['add', 'kept.txt'], dir);
    writeFileSync(path.join(dir, 'kept.txt'), 'staged then changed again\n', 'utf8');

    const status = await readGitStatus(dir);

    expect(status.files).toHaveLength(2);
    expect(status.files.filter((file) => file.staged)).toHaveLength(1);
  });
});

describe('readGitDiff', () => {
  it('returns the changed lines of a file', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'one\ntwo\nfour\n', 'utf8');

    const diff = await readGitDiff(dir, 'kept.txt', false);

    expect(diff?.path).toBe('kept.txt');
    expect(diff?.truncated).toBe(false);
    expect(diff?.hunks[0]?.lines.some((line) => line.type === 'add')).toBe(true);
    expect(diff?.hunks[0]?.lines.some((line) => line.type === 'delete')).toBe(true);
  });

  it('returns nothing for a file that did not change', async () => {
    expect(await readGitDiff(makeRepo(), 'kept.txt', false)).toBeNull();
  });

  it('cuts a diff that is too large and says so', async () => {
    const dir = makeRepo();
    const lines = Array.from({ length: MAX_DIFF_LINES + 500 }, (_, i) => `line ${i}`);
    writeFileSync(path.join(dir, 'big.txt'), `${lines.join('\n')}\n`, 'utf8');

    const diff = await readGitDiff(dir, 'big.txt', false);

    expect(diff?.truncated).toBe(true);
    const kept = diff?.hunks.reduce((total, hunk) => total + hunk.lines.length, 0) ?? 0;
    expect(kept).toBe(MAX_DIFF_LINES);
  });

  it('reads the staged copy when asked', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'one\ntwo\nstaged\n', 'utf8');
    run(['add', 'kept.txt'], dir);

    const staged = await readGitDiff(dir, 'kept.txt', true);
    const working = await readGitDiff(dir, 'kept.txt', false);

    expect(staged?.hunks[0]?.lines.some((line) => line.content.includes('staged'))).toBe(true);
    expect(working).toBeNull();
  });
});

describe('commitChanges', () => {
  it('commits exactly the files it was given', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    writeFileSync(path.join(dir, 'b.txt'), 'b\n', 'utf8');

    const result = await commitChanges(dir, 'feat: add a', ['a.txt']);

    expect(result.branch).toBe('main');
    expect(result.fileCount).toBe(1);
    expect(result.hash).toMatch(/^[0-9a-f]{7,}$/);

    const committed = run(['show', '--name-only', '--format=', 'HEAD'], dir).trim();
    expect(committed).toBe('a.txt');
    // b.txt was never selected, so it is still waiting.
    expect((await readGitStatus(dir)).files.map((file) => file.path)).toEqual(['b.txt']);
  });

  it('refuses an empty message', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    await expect(commitChanges(dir, '   ', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_nothing_selected',
    });
  });

  it('refuses when no file is selected', async () => {
    await expect(commitChanges(makeRepo(), 'feat: nothing', [])).rejects.toMatchObject({
      reason: 'git_nothing_selected',
    });
  });

  it('refuses while a merge is part-way through', async () => {
    const dir = makeRepo();
    run(['checkout', '-b', 'other'], dir);
    writeFileSync(path.join(dir, 'kept.txt'), 'other side\n', 'utf8');
    run(['commit', '-am', 'other'], dir);
    run(['checkout', 'main'], dir);
    writeFileSync(path.join(dir, 'kept.txt'), 'main side\n', 'utf8');
    run(['commit', '-am', 'main'], dir);
    // The conflict stops the merge part-way, which is the state under test.
    try {
      run(['merge', 'other'], dir);
    } catch {
      // Expected: the merge conflicts.
    }

    await expect(commitChanges(dir, 'fix: resolve', ['kept.txt'])).rejects.toMatchObject({
      reason: 'git_state_busy',
    });
  });

  it('reports a failed commit rather than throwing raw', async () => {
    const dir = makeRepo();

    await expect(commitChanges(dir, 'feat: missing', ['not-here.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
    });
  });
});
