import { execFileSync } from 'child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_DIFF_LINES,
  commitChanges,
  readGitDiff,
  readGitStatus,
} from '@electron/ipc/gateway/git-ops';
import { cleanMessage } from '@electron/ipc/gateway/git-commit-index';

const dirs: string[] = [];

function run(args: string[], cwd: string, allowFailure = false): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    if (allowFailure) return '';
    throw err;
  }
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

describe('cleanMessage', () => {
  it('picks a comment character the message does not use when set to auto', () => {
    // `#` starts a line, so auto picks another character and the line stays.
    expect(cleanMessage('feat: a\n\n# kept: it is not a comment\n', 'strip', 'auto'))
      .toBe('feat: a\n\n# kept: it is not a comment');
    expect(cleanMessage('feat: a\n\n# dropped\n', 'strip', '#')).toBe('feat: a');
  });

  it('cuts at a scissors line only, not at the marker inside a line', () => {
    const marker = '# ------------------------ >8 ------------------------';
    expect(cleanMessage(`feat: a\n\nsee ${marker} in docs\n${marker}\ndropped\n`, 'scissors'))
      .toBe(`feat: a\n\nsee ${marker} in docs`);
  });

  it('gives up, as git does, when every automatic comment character is taken', () => {
    const taken = [...'#;@!$%^&|:'].map((ch) => `${ch} line`).join('\n');
    expect(() => cleanMessage(taken, 'strip', 'auto')).toThrow(/comment character/);
  });

  it('leaves a verbatim message alone', () => {
    expect(cleanMessage('feat: a  \n\n\n# note\n', 'verbatim')).toBe('feat: a  \n\n\n# note\n');
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

  it('refuses a path that has no change', async () => {
    const dir = makeRepo();

    await expect(commitChanges(dir, 'feat: missing', ['not-here.txt'])).rejects.toMatchObject({
      reason: 'git_nothing_selected',
      message: expect.stringContaining('not-here.txt'),
    });
  });

  it('leaves an unrelated staged file staged and out of the commit', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'unselected.txt'), 'staged elsewhere\n', 'utf8');
    run(['add', 'unselected.txt'], dir);
    writeFileSync(path.join(dir, 'selected.txt'), 'selected\n', 'utf8');

    await commitChanges(dir, 'feat: selected only', ['selected.txt']);

    expect(run(['show', '--name-only', '--format=', 'HEAD'], dir).trim()).toBe('selected.txt');
    expect((await readGitStatus(dir)).files).toEqual([
      { path: 'unselected.txt', oldPath: undefined, status: 'added', staged: true },
    ]);
  });

  it('commits only the staged copy of a partially staged file', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'staged\n', 'utf8');
    run(['add', 'kept.txt'], dir);
    writeFileSync(path.join(dir, 'kept.txt'), 'staged then changed again\n', 'utf8');

    await commitChanges(dir, 'feat: staged copy', ['kept.txt']);

    expect(run(['show', 'HEAD:kept.txt'], dir)).toBe('staged\n');
    // The unreviewed working-tree change is still there, still unstaged.
    expect((await readGitStatus(dir)).files).toEqual([
      { path: 'kept.txt', oldPath: undefined, status: 'modified', staged: false },
    ]);
  });

  it('commits a staged deletion', async () => {
    const dir = makeRepo();
    run(['rm', 'kept.txt'], dir);

    await commitChanges(dir, 'chore: drop kept', ['kept.txt']);

    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('');
    expect((await readGitStatus(dir)).files).toEqual([]);
  });

  it('commits a staged rename with its old path', async () => {
    const dir = makeRepo();
    run(['mv', 'kept.txt', 'moved.txt'], dir);

    await commitChanges(dir, 'chore: move kept', ['moved.txt']);

    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('moved.txt');
    expect((await readGitStatus(dir)).files).toEqual([]);
  });

  it('commits a working-tree deletion and leaves the tree clean', async () => {
    const dir = makeRepo();
    rmSync(path.join(dir, 'kept.txt'));

    await commitChanges(dir, 'chore: drop kept', ['kept.txt']);

    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('');
    expect((await readGitStatus(dir)).files).toEqual([]);
  });

  it('makes the first commit of an empty repository', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sero-git-ops-empty-'));
    dirs.push(dir);
    run(['init', '-b', 'main'], dir);
    run(['config', 'user.email', 'test@example.com'], dir);
    run(['config', 'user.name', 'Test'], dir);
    writeFileSync(path.join(dir, 'first.txt'), 'first\n', 'utf8');

    const result = await commitChanges(dir, 'feat: first', ['first.txt']);

    expect(result.branch).toBe('main');
    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('first.txt');
  });

  it('commits a rename whose source came back untracked, and leaves the new file alone', async () => {
    const dir = makeRepo();
    run(['mv', 'kept.txt', 'moved.txt'], dir);
    writeFileSync(path.join(dir, 'kept.txt'), 'a new file with the old name\n', 'utf8');

    await commitChanges(dir, 'chore: move kept', ['moved.txt']);

    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('moved.txt');
    expect((await readGitStatus(dir)).files).toEqual([
      { path: 'kept.txt', oldPath: undefined, status: 'untracked', staged: false },
    ]);
  });

  it('keeps a staged change to a moved file\'s old name out of the commit', async () => {
    const dir = makeRepo();
    run(['mv', 'kept.txt', 'moved.txt'], dir);
    writeFileSync(path.join(dir, 'kept.txt'), 'staged again\n', 'utf8');
    run(['add', 'kept.txt'], dir);

    await commitChanges(dir, 'chore: copy kept', ['moved.txt']);

    // git calls this an addition with the old name modified, not a
    // rename, so the old name keeps its committed content and its
    // staged change waits for its own commit.
    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('kept.txt\nmoved.txt');
    expect(run(['show', 'HEAD:kept.txt'], dir)).toBe('one\ntwo\nthree\n');
    expect((await readGitStatus(dir)).files).toEqual([
      { path: 'kept.txt', oldPath: undefined, status: 'modified', staged: true },
    ]);
  });

  it('undoes a commit that a hook widened beyond the selection', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    writeFileSync(path.join(dir, 'sneaky.txt'), 'added by a hook\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\ngit add sneaky.txt\n', { mode: 0o755 });

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
      message: expect.stringContaining('sneaky.txt'),
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(before);
    expect((await readGitStatus(dir)).files.map((file) => file.path).sort()).toEqual(['a.txt', 'sneaky.txt']);
  });

  it('refuses, and keeps the other commit, when HEAD moved while the commit was made', async () => {
    const dir = makeRepo();
    // A commit made elsewhere, landing on HEAD part-way through ours.
    run(['checkout', '-q', '-b', 'elsewhere'], dir);
    writeFileSync(path.join(dir, 'theirs.txt'), 'theirs\n', 'utf8');
    run(['add', 'theirs.txt'], dir);
    run(['commit', '-qm', 'theirs'], dir);
    const theirs = run(['rev-parse', 'HEAD'], dir).trim();
    run(['checkout', '-q', 'main'], dir);
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, `#!/bin/sh\ngit update-ref HEAD ${theirs}\n`, { mode: 0o755 });
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(theirs);
    expect(run(['show', '--name-only', '--format=', 'HEAD'], dir).trim()).toBe('theirs.txt');
  });

  it('accepts a commit of a copied file when git is set to detect copies', async () => {
    const dir = makeRepo();
    run(['config', 'diff.renames', 'copies'], dir);
    writeFileSync(path.join(dir, 'copy.txt'), 'one\ntwo\nthree\n', 'utf8');

    await commitChanges(dir, 'feat: copy', ['copy.txt']);

    expect(run(['ls-tree', '--name-only', 'HEAD'], dir).trim()).toBe('copy.txt\nkept.txt');
  });

  it('keeps the temporary index out of a hook that stages the whole worktree', async () => {
    const dir = makeRepo();
    const worktree = path.join(dir, '..', `${path.basename(dir)}-hooked`);
    dirs.push(worktree);
    run(['worktree', 'add', '-b', 'hooked', worktree], dir);
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\ngit add -A\n', { mode: 0o755 });
    writeFileSync(path.join(worktree, 'a.txt'), 'a\n', 'utf8');

    await commitChanges(worktree, 'feat: a', ['a.txt']);

    expect(run(['show', '--name-only', '--format=', 'HEAD'], worktree).trim()).toBe('a.txt');
  });

  it('falls back to the host for files the runtime it was given cannot reach', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const asked: string[] = [];
    const refuse = async (filePath: string) => {
      asked.push(filePath);
      throw new Error('outside the workspace');
    };

    await commitChanges(dir, 'feat: a', ['a.txt'], {
      files: { write: refuse, read: refuse, remove: refuse },
    });

    // The runtime was asked first for each file, and the host did the
    // work when it refused, leaving nothing behind.
    expect(asked.some((filePath) => filePath.endsWith('.msg'))).toBe(true);
    expect(run(['log', '--format=%s', '-1'], dir).trim()).toBe('feat: a');
    expect(readdirSync(path.join(dir, '.git')).filter((name) => name.startsWith('sero-remote-'))).toEqual([]);
  });

  it('runs the commit-msg hook and keeps what it wrote', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'commit-msg');
    writeFileSync(hook, '#!/bin/sh\nprintf "\\nSigned-off-by: hook\\n" >> "$1"\n', { mode: 0o755 });

    await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(run(['log', '--format=%B', '-1'], dir).trim()).toBe('feat: a\n\nSigned-off-by: hook');
  });

  it('refuses the commit when the commit-msg hook rejects the message', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'commit-msg');
    writeFileSync(hook, '#!/bin/sh\necho "subject must name a scope" >&2\nexit 1\n', { mode: 0o755 });

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
      message: expect.stringContaining('subject must name a scope'),
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(before);
    expect(readdirSync(path.join(dir, '.git')).filter((name) => name.startsWith('sero-remote-'))).toEqual([]);
  });

  it('refuses a hook that turns a selected file into a directory', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    rmSync(path.join(dir, 'kept.txt'));
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nmkdir kept.txt && echo x > kept.txt/inner && git add kept.txt/inner\n', { mode: 0o755 });

    await expect(commitChanges(dir, 'chore: drop kept', ['kept.txt'])).rejects.toMatchObject({
      message: expect.stringContaining('kept.txt/inner'),
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(before);
  });

  it('lets a hook that only rewrites a selected file through', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf formatted > a.txt && git add a.txt\n', { mode: 0o755 });

    await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(run(['show', 'HEAD:a.txt'], dir)).toBe('formatted');
  });

  it('keeps a commit that landed on top of ours, and reports ours', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    // The desktop commits right after ours lands, before we have read
    // anything back. Ours must be recognised as ours and both must stay.
    // The desktop's commit is built on the new HEAD in its own index, as
    // a commit made properly would be, and its index follows it.
    const hook = path.join(dir, '.git', 'hooks', 'post-commit');
    writeFileSync(hook, [
      '#!/bin/sh',
      '[ -n "$SERO_TEST_NESTED" ] && exit 0',
      'export SERO_TEST_NESTED=1',
      'echo desktop > desktop.txt',
      'export GIT_INDEX_FILE=.git/desktop.index',
      'git read-tree HEAD',
      'git add desktop.txt',
      'git commit -q -m desktop --no-verify',
      'unset GIT_INDEX_FILE',
      'git add desktop.txt',
      'rm -f .git/desktop.index',
      '',
    ].join('\n'), { mode: 0o755 });

    const result = await commitChanges(dir, 'feat: a', ['a.txt']);

    const log = run(['log', '--format=%h %s', '-3'], dir).trim().split('\n');
    expect(log.map((line) => line.slice(line.indexOf(' ') + 1))).toEqual(['desktop', 'feat: a', 'first']);
    expect(log[1].startsWith(result.hash)).toBe(true);
    expect(run(['rev-parse', 'HEAD~2'], dir).trim()).toBe(before);
    expect(run(['show', '--name-only', '--format=', 'HEAD~1'], dir).trim()).toBe('a.txt');
    expect((await readGitStatus(dir)).files).toEqual([]);
  });

  it('reads the index against HEAD when a commit on top of ours reverted the file', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'edited\n', 'utf8');
    // A commit lands on top of ours that puts the file back as it was.
    // The index follows HEAD, so nothing is staged and the edit shows
    // as an unstaged change against the reverted file.
    const hook = path.join(dir, '.git', 'hooks', 'post-commit');
    writeFileSync(hook, [
      '#!/bin/sh',
      '[ -n "$SERO_TEST_NESTED" ] && exit 0',
      'export SERO_TEST_NESTED=1',
      'export GIT_INDEX_FILE=.git/desktop.index',
      'git read-tree HEAD',
      'git update-index --cacheinfo "100644,$(git rev-parse HEAD~1:kept.txt),kept.txt"',
      'git commit -q -m revert --no-verify',
      'rm -f .git/desktop.index',
      '',
    ].join('\n'), { mode: 0o755 });

    await commitChanges(dir, 'feat: kept', ['kept.txt']);

    expect(run(['log', '--format=%s', '-3'], dir).trim().split('\n')).toEqual(['revert', 'feat: kept', 'first']);
    expect(run(['diff', '--cached', '--name-only'], dir).trim()).toBe('');
    expect((await readGitStatus(dir)).files).toEqual([
      { path: 'kept.txt', oldPath: undefined, status: 'modified', staged: false },
    ]);
  });

  it('commits to the branch the phone saw, not one a hook switched to', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nunset GIT_INDEX_FILE\ngit switch -q -c other\n', { mode: 0o755 });
    // A post-commit hook expects HEAD to be the new commit. HEAD is on
    // `other` now, so the hook is not run against the wrong commit.
    writeFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), '#!/bin/sh\ntouch post-ran\n', { mode: 0o755 });

    const result = await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(result.branch).toBe('main');
    expect(run(['rev-parse', 'other'], dir).trim()).toBe(before);
    expect(run(['log', '--format=%s', '-1', 'main'], dir).trim()).toBe('feat: a');
    expect(existsSync(path.join(dir, 'post-ran'))).toBe(false);
  });

  it('refuses, from a detached HEAD, when a hook pointed HEAD at a branch meanwhile', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    run(['checkout', '-q', '--detach'], dir);
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nunset GIT_INDEX_FILE\ngit switch -q main\n', { mode: 0o755 });

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
      message: expect.stringContaining('changed'),
    });

    // The branch the hook switched to did not take the commit.
    expect(run(['rev-parse', 'main'], dir).trim()).toBe(before);
    expect(run(['symbolic-ref', 'HEAD'], dir).trim()).toBe('refs/heads/main');
  });

  it('commits on a detached HEAD and reports no branch', async () => {
    const dir = makeRepo();
    run(['checkout', '-q', '--detach'], dir);
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    const result = await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(result.branch).toBe('');
    expect(run(['log', '--format=%s', '-1'], dir).trim()).toBe('feat: a');
    expect(run(['symbolic-ref', '--quiet', 'HEAD'], dir, true)).toBe('');
  });

  it('signs when the repository signs, and fails as git commit would when it cannot', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    run(['config', 'commit.gpgsign', 'true'], dir);
    run(['config', 'user.signingkey', 'no-such-key'], dir);
    run(['config', 'gpg.program', '/usr/bin/false'], dir);
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
      message: expect.stringMatching(/sign/i),
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(before);
  });

  it('treats a bare commit.gpgsign with no value as signing, like git does', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    appendFileSync(path.join(dir, '.git', 'config'), '[commit]\n\tgpgsign\n[gpg]\n\tprogram = /usr/bin/false\n');
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      message: expect.stringMatching(/sign/i),
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(before);
  });

  it('refuses, as git commit would, when commit.gpgsign is not a boolean', async () => {
    const dir = makeRepo();
    const before = run(['rev-parse', 'HEAD'], dir).trim();
    run(['config', 'commit.gpgsign', 'sometimes'], dir);
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    await expect(commitChanges(dir, 'feat: a', ['a.txt'])).rejects.toMatchObject({
      reason: 'git_commit_failed',
      message: expect.stringMatching(/bool/i),
    });

    expect(run(['rev-parse', 'HEAD'], dir).trim()).toBe(before);
  });

  it('tidies the message the way commit.cleanup says', async () => {
    const dir = makeRepo();
    run(['config', 'commit.cleanup', 'strip'], dir);
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const hook = path.join(dir, '.git', 'hooks', 'commit-msg');
    writeFileSync(hook, '#!/bin/sh\nprintf "# a note from the hook\\n\\n\\nBody  \\n" >> "$1"\n', { mode: 0o755 });

    await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(run(['log', '--format=%B', '-1'], dir)).toBe('feat: a\n\nBody\n\n');
  });

  it('follows a hook that rewrites an already staged file, so nothing stays staged', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    run(['add', 'a.txt'], dir);
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf formatted > a.txt && git add a.txt\n', { mode: 0o755 });

    await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(run(['show', 'HEAD:a.txt'], dir)).toBe('formatted');
    expect(run(['diff', '--cached', '--name-only'], dir).trim()).toBe('');
    expect((await readGitStatus(dir)).files).toEqual([]);
  });

  it('keeps an index entry that changed while the commit was made', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'kept.txt'), 'edited\n', 'utf8');
    // The desktop stages a newer copy of the selected file after ours was
    // read. That entry is theirs now and must not be overwritten.
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nunset GIT_INDEX_FILE\nprintf newer > kept.txt && git add kept.txt\n', { mode: 0o755 });

    await commitChanges(dir, 'feat: kept', ['kept.txt']);

    expect(run(['show', 'HEAD:kept.txt'], dir)).toBe('edited\n');
    expect(run(['show', ':kept.txt'], dir)).toBe('newer');
    expect(run(['diff', '--cached', '--name-only'], dir).trim()).toBe('kept.txt');
  });

  it('commits from a linked worktree and leaves no temporary index in it', async () => {
    const dir = makeRepo();
    const worktree = path.join(dir, '..', `${path.basename(dir)}-wt`);
    dirs.push(worktree);
    run(['worktree', 'add', '-b', 'wt', worktree], dir);
    writeFileSync(path.join(worktree, 'a.txt'), 'a\n', 'utf8');

    await commitChanges(worktree, 'feat: a', ['a.txt']);

    expect(run(['ls-tree', '--name-only', 'HEAD'], worktree).trim()).toBe('a.txt\nkept.txt');
    expect((await readGitStatus(worktree)).files).toEqual([]);
    const leftovers = [
      ...readdirSync(worktree),
      ...readdirSync(path.join(dir, '.git', 'worktrees', path.basename(worktree))),
    ];
    expect(leftovers.filter((name) => name.startsWith('sero-remote-'))).toEqual([]);
  });

  it('runs two commits to one repository one after the other', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    writeFileSync(path.join(dir, 'b.txt'), 'b\n', 'utf8');

    await Promise.all([
      commitChanges(dir, 'feat: a', ['a.txt']),
      commitChanges(dir, 'feat: b', ['b.txt']),
    ]);

    expect(run(['log', '--format=%s', '-3'], dir).trim().split('\n')).toEqual(['feat: b', 'feat: a', 'first']);
    expect((await readGitStatus(dir)).files).toEqual([]);
  });

  it('leaves no temporary index behind', async () => {
    const dir = makeRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'a\n', 'utf8');

    await commitChanges(dir, 'feat: a', ['a.txt']);

    expect(readdirSync(path.join(dir, '.git')).filter((name) => name.startsWith('sero-remote-'))).toEqual([]);
  });
});
