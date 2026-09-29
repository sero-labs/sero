import { describe, expect, it } from 'vitest';
import { CliRegistry, type CliCommand } from '@electron/cli/core';
import { installCliSessionBridge, type CliSessionBridge, type CliSessionEntry } from '@electron/cli/bridges/session-bridge';

function command(name: string, chatOnly?: boolean): CliCommand {
  return { name, summary: name, source: 'builtin', chatOnly, execute: async () => ({ output: 'ok' }) };
}

function bridgeKnowing(chatId: string): CliSessionBridge {
  const entry = { sessionId: chatId } as CliSessionEntry;
  return {
    getSessionEntry: (id) => (id === chatId ? entry : undefined),
    getActiveSessionForWorkspace: () => undefined,
    getActiveTurnId: () => null,
    noteTurnStart: () => {},
    noteTurnEnd: () => {},
    consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 1 }),
    setSessionTitle: () => {},
  };
}

describe('chat-only commands', () => {
  it('are shown to a chat and hidden from a session that is not a chat', () => {
    installCliSessionBridge(bridgeKnowing('chat-1'));
    const registry = new CliRegistry();
    registry.register(command('set-title', true));
    registry.register(command('workspace'));

    const names = (sessionId: string) => registry.list({ workspaceId: 'w', sessionId }).map((c) => c.name);

    expect(names('chat-1')).toEqual(['set-title', 'workspace']);
    expect(names('subagent-1')).toEqual(['workspace']);
    expect(registry.get('set-title', { workspaceId: 'w', sessionId: 'subagent-1' })).toBeUndefined();
  });
});
