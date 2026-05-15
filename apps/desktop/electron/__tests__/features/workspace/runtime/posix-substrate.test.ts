import type { ChildProcess } from 'child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';

const tempDirs: string[] = [];

describe('PosixHostSubstrate', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('renders non-login shell commands with bash -c', () => {
    const substrate = createPosixHostSubstrate();

    const rendered = substrate.shellCommand({ command: 'echo ok', cwd: '/tmp/workspace' });

    expect(rendered.program).toBe('bash');
    expect(rendered.args).toEqual(['-c', 'echo ok']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
  });

  it('renders login shell commands with bash --login -c', () => {
    const substrate = createPosixHostSubstrate();

    const rendered = substrate.shellCommand({ command: 'echo ok', cwd: '/tmp/workspace', loginShell: true });

    expect(rendered.program).toBe('bash');
    expect(rendered.args).toEqual(['--login', '-c', 'echo ok']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
  });

  it('renders execFile commands as the direct program and args', () => {
    const substrate = createPosixHostSubstrate();

    const rendered = substrate.execFileCommand({
      program: 'git',
      args: ['status', '--short'],
      cwd: '/tmp/workspace',
      env: { FOO: 'bar' },
    });

    expect(rendered).toEqual({
      program: 'git',
      args: ['status', '--short'],
      nativeCwd: '/tmp/workspace',
      env: { FOO: 'bar' },
    });
  });

  it('signals child processes directly', async () => {
    const substrate = createPosixHostSubstrate();
    const child = { kill: vi.fn() } as unknown as ChildProcess;
    const rendered = substrate.shellCommand({ command: 'sleep 30', cwd: '/tmp/workspace' });

    await substrate.signalChild(child, rendered, 'SIGTERM');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('resolves missing paths through the nearest existing ancestor', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-posix-root-'));
    tempDirs.push(root);
    const substrate = createPosixHostSubstrate();

    await expect(substrate.resolvePathInsideRoot(path.join(root, 'new', 'child.txt'), root)).resolves.toBe(
      path.join(await realpath(root), 'new', 'child.txt'),
    );
  });

  it('rejects symlink escapes after canonicalizing the existing ancestor', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-posix-root-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'sero-posix-outside-'));
    tempDirs.push(root, outside);
    await writeFile(path.join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(outside, path.join(root, 'outside-link'));
    const substrate = createPosixHostSubstrate();

    await expect(substrate.resolvePathInsideRoot(path.join(root, 'outside-link', 'secret.txt'), root)).resolves.toBeNull();
    await expect(substrate.resolvePathInsideRoot(path.join(root, 'outside-link', 'new.txt'), root)).resolves.toBeNull();
  });

  it('rejects lexical sibling paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-posix-root-'));
    const sibling = `${root}-sibling`;
    tempDirs.push(root, sibling);
    await mkdir(sibling);
    const substrate = createPosixHostSubstrate();

    await expect(substrate.resolvePathInsideRoot(path.join(sibling, 'file.txt'), root)).resolves.toBeNull();
  });
});
