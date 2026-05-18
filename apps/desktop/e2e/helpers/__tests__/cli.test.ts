import { describe, expect, it } from 'vitest';

import { CliRegistry, type CliCommandContext } from '@electron/cli/core';
import { runCli } from '../cli';

function makeContext(): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/workspace',
    invocation: { workspaceId: 'ws-1', sessionId: null, turnId: null, source: 'bash' },
    workspaceManager: {} as CliCommandContext['workspaceManager'],
    containerManager: {} as CliCommandContext['containerManager'],
  };
}

describe('runCli', () => {
  it('returns stdout and exit from executeCliArgv', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'echo',
      summary: 'Echo args',
      execute: async (args) => ({ output: JSON.stringify(args), exitCode: 0 }),
    });

    await expect(runCli(registry, ['echo', '--content', 'hello world'], makeContext()))
      .resolves.toEqual({ stdout: '["--content","hello world"]', exit: 0 });
  });

  it('returns non-zero exits without exposing rich result fields', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'fail',
      summary: 'Fail intentionally',
      execute: async () => ({
        output: 'failed',
        exitCode: 2,
        content: [{ type: 'text', text: 'hidden' }],
        details: { hidden: true },
      }),
    });

    await expect(runCli(registry, ['fail'], makeContext()))
      .resolves.toEqual({ stdout: 'failed', exit: 2 });
  });

  it('preserves argv tokens with spaces and JSON without re-tokenizing', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'inspect',
      summary: 'Inspect args',
      execute: async (args) => ({ output: JSON.stringify(args), exitCode: 0 }),
    });

    await expect(
      runCli(
        registry,
        ['inspect', '--content', 'hello world', '--json', '{"a b":true}'],
        makeContext(),
      ),
    ).resolves.toEqual({
      stdout: '["--content","hello world","--json","{\\"a b\\":true}"]',
      exit: 0,
    });
  });
});
