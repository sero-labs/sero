import { describe, expect, it, vi } from 'vitest';

import {
  renderPluginHostCommand,
  renderPluginHostShellCommand,
  runPluginHostCommand,
} from '@electron/features/plugins/host-command-runner';

describe('plugin host command runner', () => {
  it('runs managed host tools with prepared PATH', async () => {
    const tools = {
      prepareProgram: vi.fn(async (program: string) => (
        program === 'node' ? '/managed/bin/node' : '/managed/bin/npm'
      )),
      prepareEnv: vi.fn(async (env: Record<string, string>) => ({
        ...env,
        PATH: `/managed/bin:${env.PATH ?? ''}`,
      })),
    };
    const execute = vi.fn(async () => ({ stdout: '[{"filename":"plugin.tgz"}]', stderr: '' }));

    const result = await runPluginHostCommand('npm', ['pack', '@acme/plugin'], '/tmp/plugin-stage', {
      env: { PATH: '/usr/bin', npm_config_cache: undefined },
      execute,
      tools,
    });

    expect(result.stdout).toContain('plugin.tgz');
    expect(tools.prepareProgram).toHaveBeenNthCalledWith(1, 'node', expect.objectContaining({
      kind: 'plugin-install',
      command: 'npm pack @acme/plugin',
    }));
    expect(tools.prepareProgram).toHaveBeenNthCalledWith(2, 'npm', expect.objectContaining({
      kind: 'plugin-install',
      command: 'npm pack @acme/plugin',
    }));
    expect(tools.prepareEnv).toHaveBeenCalledWith({ PATH: '/usr/bin' });
    expect(execute).toHaveBeenCalledWith('/managed/bin/npm', ['pack', '@acme/plugin'], {
      cwd: '/tmp/plugin-stage',
      encoding: 'utf8',
      env: { PATH: '/managed/bin:/usr/bin' },
    });
  });

  it('runs Windows command shims through cmd.exe', async () => {
    const tools = {
      prepareProgram: vi.fn(async () => 'C:\\Sero\\tools\\npm.cmd'),
      prepareEnv: vi.fn(async (env: Record<string, string>) => env),
    };
    const execute = vi.fn(async () => ({ stdout: '', stderr: '' }));

    await runPluginHostCommand('npm', ['install'], 'C:\\stage', {
      env: {},
      execute,
      platform: 'win32',
      tools,
    });

    expect(execute).toHaveBeenCalledWith('cmd.exe', [
      '/d',
      '/s',
      '/c',
      '""C:\\Sero\\tools\\npm.cmd" "install""',
    ], {
      cwd: 'C:\\stage',
      encoding: 'utf8',
      env: {},
    });
  });

  it('prepares package-manager tools before running plugin dev shell commands', async () => {
    const tools = {
      prepareProgram: vi.fn(async (program: string) => `/managed/bin/${program}`),
      prepareShell: vi.fn(async () => ({ tool: 'bash' as const, source: 'system' as const, path: '/bin/bash' })),
      prepareEnv: vi.fn(async (env: Record<string, string>) => ({
        ...env,
        PATH: `/managed/bin:${env.PATH ?? ''}`,
      })),
    };

    await expect(renderPluginHostShellCommand('pnpm dev', '/tmp/plugin', {
      env: { PATH: '/usr/bin' },
      tools,
    })).resolves.toEqual({
      program: '/bin/bash',
      args: ['-c', 'pnpm dev'],
      cwd: '/tmp/plugin',
      env: { PATH: '/managed/bin:/usr/bin' },
    });

    expect(tools.prepareProgram).toHaveBeenNthCalledWith(1, 'node', expect.any(Object));
    expect(tools.prepareProgram).toHaveBeenNthCalledWith(2, 'pnpm', expect.any(Object));
  });

  it('uses absolute system tar when PATH may not contain system directories', async () => {
    const rendered = await renderPluginHostCommand('tar', ['-xzf', 'plugin.tgz'], '/tmp/plugin', {
      env: {},
      tools: {
        prepareProgram: vi.fn(async (program: string) => program),
        prepareEnv: vi.fn(async (env: Record<string, string>) => env),
      },
    });

    expect(rendered.program).toMatch(/(?:^|[\\/])tar(?:\.exe)?$/i);
  });
});
