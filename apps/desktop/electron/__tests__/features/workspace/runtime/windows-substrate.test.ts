import type { ChildProcess } from 'child_process';
import { execFile } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { createWindowsHostSubstrate } from '@electron/features/workspace/runtime/backends/host/windows-substrate';
import type { HostToolResolverLike } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import type { ToolInstallReason, ToolName, ToolResolution, ToolStatus } from '@electron/features/workspace/runtime/toolchains/types';

function createMockTools(): HostToolResolverLike {
  const resolution = (tool: ToolName): ToolResolution => ({
    tool,
    source: 'managed',
    path: `C:\\Sero\\tools\\bin\\${tool}.exe`,
    binDir: 'C:\\Sero\\tools\\bin',
  });
  return {
    resolve: vi.fn(async (tool) => resolution(tool)),
    ensure: vi.fn(async (tool, _reason: ToolInstallReason) => resolution(tool)),
    status: vi.fn(async (tool): Promise<ToolStatus> => ({ ...resolution(tool), state: 'ready' })),
    prepareEnv: vi.fn(async (env = {}) => ({
      ...env,
      Path: `C:\\Sero\\tools\\bin${env.Path ? `;${env.Path}` : ''}`,
    })),
    prepareShell: vi.fn(async (_reason) => resolution('bash')),
    prepareProgram: vi.fn(async (program) => {
      if (program === 'git') return 'C:\\Sero\\tools\\bin\\git.exe';
      if (program === 'npm') return 'C:\\Sero\\tools\\bin\\npm.cmd';
      return program;
    }),
    resolveTerminalShell: vi.fn(async () => 'C:\\Sero\\tools\\bin\\bash.exe'),
  };
}

describe('WindowsHostSubstrate', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockImplementation((_program, _args, _options, callback) => {
      const done = typeof _options === 'function' ? _options : callback;
      done?.(null, '', '');
      return {} as ReturnType<typeof execFile>;
    });
  });
  it('renders shell commands through resolver-backed Git Bash/MSYS-compatible bash', async () => {
    const substrate = createWindowsHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.shellCommand({
      command: 'pnpm dev',
      cwd: 'C:\\Users\\me\\repo',
      env: { FOO: 'bar', Path: 'C:\\Windows\\System32' },
    });

    expect(rendered.program).toMatch(/bash\.exe$/i);
    expect(rendered.args).toEqual(['-c', 'pnpm dev']);
    expect(rendered.nativeCwd).toBe('C:\\Users\\me\\repo');
    expect(rendered.env).toEqual({ FOO: 'bar', Path: 'C:\\Sero\\tools\\bin;C:\\Windows\\System32' });
  });

  it('preserves native Windows cwd and Path casing for execFile rendering', async () => {
    const substrate = createWindowsHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.execFileCommand({
      program: 'git',
      args: ['status', '--short'],
      cwd: 'C:\\Users\\me\\repo',
      env: { Path: 'C:\\Git\\cmd' },
    });

    expect(rendered).toEqual({
      program: 'C:\\Sero\\tools\\bin\\git.exe',
      args: ['status', '--short'],
      nativeCwd: 'C:\\Users\\me\\repo',
      env: { Path: 'C:\\Sero\\tools\\bin;C:\\Git\\cmd' },
    });
  });

  it('wraps managed cmd shims through cmd.exe for execFile rendering', async () => {
    const substrate = createWindowsHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.execFileCommand({
      program: 'npm',
      args: ['--version'],
      cwd: 'C:\\Users\\me\\repo',
      env: { Path: 'C:\\Git\\cmd' },
    });

    expect(rendered.program).toMatch(/\\System32\\cmd\.exe$/i);
    expect(rendered.args).toEqual(['/d', '/s', '/c', '""C:\\Sero\\tools\\bin\\npm.cmd" "--version""']);
    expect(rendered.nativeCwd).toBe('C:\\Users\\me\\repo');
    expect(rendered.env).toEqual({ Path: 'C:\\Sero\\tools\\bin;C:\\Git\\cmd' });
  });

  it('uses node-pty terminal through the verified shell', async () => {
    const substrate = createWindowsHostSubstrate({ tools: createMockTools() });

    const rendered = await substrate.terminalCommand({ cwd: 'C:\\Users\\me\\repo', env: { Path: 'C:\\Windows' } });

    expect(rendered.program).toBe('C:\\Sero\\tools\\bin\\bash.exe');
    expect(rendered.args).toEqual(['--login']);
    expect(rendered.nativeCwd).toBe('C:\\Users\\me\\repo');
    expect(Object.keys(rendered.env ?? {})).toContain('Path');
  });

  it('checks Windows path containment case-insensitively with native separators', async () => {
    const substrate = createWindowsHostSubstrate({ tools: createMockTools() });

    expect(substrate.isPathInsideRoot('C:\\Users\\me\\repo\\src\\App.tsx', 'c:\\users\\me\\repo')).toBe(true);
    expect(substrate.isPathInsideRoot('C:\\Users\\me\\repo-sibling\\file.txt', 'C:\\Users\\me\\repo')).toBe(false);
    expect(substrate.isPathInsideRoot('D:\\repo\\file.txt', 'C:\\Users\\me\\repo')).toBe(false);
    await expect(substrate.resolvePathInsideRoot('C:\\Users\\me\\repo\\new\\file.txt', 'C:\\Users\\me\\repo')).resolves
      .toBe('C:\\Users\\me\\repo\\new\\file.txt');
  });

  it('normalizes CRLF command output and terminates children with taskkill', async () => {
    const substrate = createWindowsHostSubstrate({ tools: createMockTools() });
    const child = { pid: 1234, kill: vi.fn() } as unknown as ChildProcess;
    const rendered = await substrate.shellCommand({ command: 'echo ok', cwd: 'C:\\repo' });

    await substrate.signalChild(child, rendered, 'SIGTERM');
    await substrate.signalChild(child, rendered, 'SIGKILL');

    expect(substrate.normalizeExecOutput('one\r\ntwo\r\n')).toBe('one\ntwo\n');
    expect(child.kill).not.toHaveBeenCalled();
    expect(execFile).toHaveBeenNthCalledWith(1, expect.stringMatching(/\\System32\\taskkill\.exe$/i), ['/PID', '1234', '/T'], expect.any(Function));
    expect(execFile).toHaveBeenNthCalledWith(2, expect.stringMatching(/\\System32\\taskkill\.exe$/i), ['/PID', '1234', '/T', '/F'], expect.any(Function));
  });
});
