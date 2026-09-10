import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { WorktreeManager } from '@electron/features/git/worktree/manager';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it('shares current files across Room members and restart without changing HEAD or the index', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sero-room-base-test-'));
  roots.push(root);
  const git = async (...args: string[]) => (await exec('git', args, { cwd: root })).stdout.trim();
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Test');
  await git('config', 'user.email', 'test@example.com');
  await writeFile(path.join(root, '.gitignore'), '.sero/\nignored.txt\n');
  await writeFile(path.join(root, 'tracked.txt'), 'committed');
  await git('add', '.');
  await git('commit', '-m', 'initial');
  await writeFile(path.join(root, 'tracked.txt'), 'staged');
  await git('add', 'tracked.txt');
  await writeFile(path.join(root, 'tracked.txt'), 'unstaged');
  await writeFile(path.join(root, 'new.txt'), 'new delivery');
  await writeFile(path.join(root, 'ignored.txt'), 'scratch');
  await mkdir(path.join(root, '.sero'));
  await writeFile(path.join(root, '.sero', 'runtime.json'), '{}');
  const head = await git('rev-parse', 'HEAD');
  const index = await readFile(path.join(root, '.git/index'));
  const status = await git('status', '--porcelain');
  const first = await new WorktreeManager().create(root, 'room-first', 'Review', { workspaceSnapshotKey: 'room-1' });
  expect(await readFile(path.join(first.worktreePath, 'tracked.txt'), 'utf8')).toBe('unstaged');
  expect(await readFile(path.join(first.worktreePath, 'new.txt'), 'utf8')).toBe('new delivery');
  await expect(readFile(path.join(first.worktreePath, 'ignored.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await git('rev-parse', 'HEAD')).toBe(head);
  expect(await readFile(path.join(root, '.git/index'))).toEqual(index);
  expect(await git('status', '--porcelain')).toBe(status);

  await writeFile(path.join(root, 'new.txt'), 'later root edit');
  await writeFile(path.join(first.worktreePath, 'new.txt'), 'member edit');
  const second = await new WorktreeManager().create(root, 'room-second', 'Repair', { workspaceSnapshotKey: 'room-1' });
  expect(await readFile(path.join(second.worktreePath, 'new.txt'), 'utf8')).toBe('new delivery');
  expect(await readFile(path.join(first.worktreePath, 'new.txt'), 'utf8')).toBe('member edit');
  expect(await readFile(path.join(root, 'new.txt'), 'utf8')).toBe('later root edit');
  expect(await git('rev-parse', 'HEAD')).toBe(head);
  expect(await readFile(path.join(root, '.git/index'))).toEqual(index);
});

it('does not commit or unstage the project when a Room starts before its first commit', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sero-unborn-room-test-'));
  roots.push(root);
  await exec('git', ['init', '-b', 'main'], { cwd: root });
  await writeFile(path.join(root, 'cli.py'), 'staged scaffold');
  await exec('git', ['add', 'cli.py'], { cwd: root });
  const index = await readFile(path.join(root, '.git/index'));
  await writeFile(path.join(root, 'cli.py'), 'current implementation');
  await mkdir(path.join(root, '.sero'));
  await writeFile(path.join(root, '.sero', 'runtime.json'), '{}');
  const member = await new WorktreeManager().create(root, 'first-member', 'Review CLI', { workspaceSnapshotKey: 'new-room' });
  expect(await readFile(path.join(member.worktreePath, 'cli.py'), 'utf8')).toBe('current implementation');
  await expect(readFile(path.join(member.worktreePath, '.sero', 'runtime.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(exec('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root })).rejects.toMatchObject({ code: 128 });
  expect(await readFile(path.join(root, '.git/index'))).toEqual(index);
  expect(await readFile(path.join(root, 'cli.py'), 'utf8')).toBe('current implementation');
  await expect(readFile(path.join(root, '.gitignore'))).rejects.toMatchObject({ code: 'ENOENT' });
});
