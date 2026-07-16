import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

import { registerSessionCliCommands } from '@electron/cli/commands/agent';
import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext } from '@electron/cli/core/types';

const setSessionTitle = vi.fn();
let sessionName: string | undefined;

const context = {
  invocation: { sessionId: 'session-1' },
} as CliCommandContext;

async function runSetTitle(...args: string[]) {
  const registry = new CliRegistry();
  registerSessionCliCommands(registry);
  const resolved = registry.resolveTokens(['set-title', ...args]);
  return registry.executeResolved(resolved, resolved.args, context);
}

describe('set-title CLI command', () => {
  beforeEach(() => {
    sessionName = undefined;
    setSessionTitle.mockReset();
    installCliSessionBridge({
      getSessionEntry: () => ({
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        session: { sessionName } as AgentSession,
      }),
      getActiveSessionForWorkspace: () => undefined,
      getActiveTurnId: () => null,
      noteTurnStart: () => {},
      noteTurnEnd: () => {},
      consumeTurnBudget: () => ({ allowed: true, count: 1, limit: 50 }),
      setSessionTitle,
    });
  });

  it('sets a title only when the session is unnamed', async () => {
    const result = await runSetTitle('--if-unnamed', 'Fix', 'session', 'titles');

    expect(result.exitCode).toBe(0);
    expect(setSessionTitle).toHaveBeenCalledWith('session-1', 'Fix session titles');
  });

  it('keeps an existing title when requested', async () => {
    sessionName = 'Existing title';
    const result = await runSetTitle('--if-unnamed', 'Replacement');

    expect(result.output).toBe('Session already has a title');
    expect(setSessionTitle).not.toHaveBeenCalled();
  });

  it('truncates titles longer than 48 characters', async () => {
    const result = await runSetTitle('x'.repeat(60));

    expect(result.exitCode).toBe(0);
    expect(setSessionTitle).toHaveBeenCalledWith('session-1', 'x'.repeat(48));
  });

  it('accepts --if-unnamed after the title text', async () => {
    const result = await runSetTitle('Fix', 'session', 'titles', '--if-unnamed');

    expect(result.exitCode).toBe(0);
    expect(setSessionTitle).toHaveBeenCalledWith('session-1', 'Fix session titles');
  });

  it('honours --if-unnamed after the title when a title exists', async () => {
    sessionName = 'Existing title';
    const result = await runSetTitle('Replacement', '--if-unnamed');

    expect(result.output).toBe('Session already has a title');
    expect(setSessionTitle).not.toHaveBeenCalled();
  });
});
