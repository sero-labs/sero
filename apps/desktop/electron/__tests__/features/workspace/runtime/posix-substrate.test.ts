import type { ChildProcess } from 'child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';
import type { HostToolResolverLike } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import type { ToolInstallReason, ToolName, ToolResolution, ToolStatus } from '@electron/features/workspace/runtime/toolchains/types';

const tempDirs: string[] = [];

function createMockTools(options: { terminalShell?: string } = {}): HostToolResolverLike {
  const resolution = (tool: ToolName): ToolResolution => ({
    tool,
    source: 'managed',
    path: `/managed/bin/${tool}`,
    binDir: '/managed/bin',
  });
  return {
    resolve: vi.fn(async (tool) => resolution(tool)),
    ensure: vi.fn(async (tool, _reason: ToolInstallReason) => resolution(tool)),
    status: vi.fn(async (tool): Promise<ToolStatus> => ({ ...resolution(tool), state: 'ready' })),
    prepareEnv: vi.fn(async (env = {}) => ({ ...env, PATH: `/managed/bin${env.PATH ? `:${env.PATH}` : ''}` })),
    prepareShell: vi.fn(async (_reason) => resolution('bash')),
    prepareProgram: vi.fn(async (program) => (program === 'git' ? '/managed/bin/git' : program)),
    resolveTerminalShell: vi.fn(async (candidate) => options.terminalShell ?? candidate ?? '/managed/bin/bash'),
  };
}

describe('PosixHostSubstrate', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('renders non-login shell commands with bash -c', async () => {
    const substrate = createPosixHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.shellCommand({ command: 'echo ok', cwd: '/tmp/workspace' });

    expect(rendered.program).toBe('/managed/bin/bash');
    expect(rendered.args).toEqual(['-c', 'echo ok']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
  });

  it('renders login shell commands with bash --login -c', async () => {
    const substrate = createPosixHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.shellCommand({ command: 'echo ok', cwd: '/tmp/workspace', loginShell: true });

    expect(rendered.program).toBe('/managed/bin/bash');
    expect(rendered.args).toEqual(['--login', '-c', 'echo ok']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
  });

  it('renders execFile commands with resolver-backed program and env', async () => {
    const substrate = createPosixHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.execFileCommand({
      program: 'git',
      args: ['status', '--short'],
      cwd: '/tmp/workspace',
      env: { FOO: 'bar', PATH: '/usr/bin' },
    });

    expect(rendered).toEqual({
      program: '/managed/bin/git',
      args: ['status', '--short'],
      nativeCwd: '/tmp/workspace',
      env: { FOO: 'bar', PATH: '/managed/bin:/usr/bin' },
    });
  });

  it('falls back to resolver-backed bash when terminal SHELL is absent', async () => {
    const substrate = createPosixHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.terminalCommand({ cwd: '/tmp/workspace', env: { PATH: '/usr/bin' } });

    expect(rendered.program).toBe('/managed/bin/bash');
    expect(rendered.args).toEqual(['--login']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
    expect(rendered.env).toEqual({ PATH: '/managed/bin:/usr/bin' });
  });

  it('honors a verified terminal SHELL from the prepared env', async () => {
    const substrate = createPosixHostSubstrate({ tools: createMockTools({ terminalShell: '/bin/zsh' }) });

    const rendered = await substrate.terminalCommand({ cwd: '/tmp/workspace', env: { SHELL: '/bin/zsh', PATH: '/usr/bin' } });

    expect(rendered.program).toBe('/bin/zsh');
  });

  it('signals child processes directly', async () => {
    const substrate = createPosixHostSubstrate({ tools: createMockTools() });
    const child = { kill: vi.fn() } as unknown as ChildProcess;
    const rendered = await substrate.shellCommand({ command: 'sleep 30', cwd: '/tmp/workspace' });

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
