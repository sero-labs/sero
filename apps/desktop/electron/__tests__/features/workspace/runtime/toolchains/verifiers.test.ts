import { describe, expect, it, vi } from 'vitest';

import type { ToolVerifierRunner } from '@electron/features/workspace/runtime/toolchains/verifiers';
import { satisfiesMinimum, verifyBash, verifyNode, verifyTool } from '@electron/features/workspace/runtime/toolchains/verifiers';

function runner(result: Awaited<ReturnType<ToolVerifierRunner>>): ToolVerifierRunner {
  return vi.fn(async () => result);
}

describe('toolchain verifiers', () => {
  it('marks compatible tools ready after running a version command', async () => {
    const run = runner({ stdout: 'v22.1.0\n', stderr: '', exitCode: 0 });

    await expect(verifyNode('/usr/local/bin/node', { run })).resolves.toMatchObject({
      tool: 'node',
      state: 'ready',
      source: 'system',
      path: '/usr/local/bin/node',
      version: '22.1.0',
    });
    expect(run).toHaveBeenCalledWith('/usr/local/bin/node', ['--version'], { timeoutMs: 5_000 });
  });

  it('marks old versions incompatible instead of trusting PATH presence', async () => {
    const run = runner({ stdout: 'v20.11.0\n', stderr: '', exitCode: 0 });

    await expect(verifyNode('node', { run })).resolves.toMatchObject({
      tool: 'node',
      state: 'incompatible',
      source: 'system',
      path: 'node',
      version: '20.11.0',
      requiredVersion: '22.0.0',
    });
  });

  it('marks missing tools as installable without running global installers', async () => {
    const run = runner({ stdout: '', stderr: 'spawn node ENOENT', exitCode: 1, errorCode: 'ENOENT' });

    await expect(verifyNode('node', { run })).resolves.toMatchObject({
      tool: 'node',
      state: 'missing',
      error: { code: 'TOOL_REQUIRED', installable: true },
    });
    expect(run).not.toHaveBeenCalledWith(expect.stringContaining('corepack'), expect.arrayContaining(['enable']), expect.anything());
    expect(run).not.toHaveBeenCalledWith(expect.stringContaining('npm'), expect.arrayContaining(['install', '-g']), expect.anything());
  });

  it('marks timeouts as retryable failures', async () => {
    const run = runner({ stdout: '', stderr: '', exitCode: 1, timedOut: true });

    await expect(verifyTool('git', 'git', { run })).resolves.toMatchObject({
      tool: 'git',
      state: 'failed',
      error: { retryable: true },
    });
  });

  it('verifies bash with a Bash-compatible smoke command', async () => {
    const run = vi.fn<ToolVerifierRunner>(async (_program, args) => {
      if (args[0] === '--version') return { stdout: 'GNU bash, version 5.2.0\n', stderr: '', exitCode: 0 };
      return { stdout: 'sero-bash-ok', stderr: '', exitCode: 0 };
    });

    await expect(verifyBash('bash', { run })).resolves.toMatchObject({
      tool: 'bash',
      state: 'ready',
      version: '5.2.0',
    });
    expect(run).toHaveBeenNthCalledWith(2, 'bash', ['-lc', 'printf sero-bash-ok'], { timeoutMs: 5_000 });
  });

  it('supports generic probes for small tools', async () => {
    const run = runner({ stdout: 'ripgrep 14.1.0\n', stderr: '', exitCode: 0 });

    await expect(verifyTool('rg', 'rg', { run })).resolves.toMatchObject({
      tool: 'rg',
      state: 'ready',
      version: '14.1.0',
    });
  });

  it('compares semantic version minimums', () => {
    expect(satisfiesMinimum('22.0.0', '22.0.0')).toBe(true);
    expect(satisfiesMinimum('22.1.0', '22.0.0')).toBe(true);
    expect(satisfiesMinimum('21.9.0', '22.0.0')).toBe(false);
  });
});
