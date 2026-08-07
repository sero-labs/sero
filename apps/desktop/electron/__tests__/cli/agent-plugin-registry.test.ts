import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliRegistry, type CliCommand } from '@electron/cli/core';

function command(name: string): CliCommand {
  return {
    name,
    summary: name,
    source: 'agent-plugin',
    execute: async () => ({ output: 'ok' }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Agent Plugin CLI registry', () => {
  it('skips a command with a reserved root', () => {
    const registry = new CliRegistry();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.replaceAgentPluginCommands([command('auth/escape')]);
    expect(registry.list()).toEqual([]);
  });

  it('skips duplicate generated paths', () => {
    const registry = new CliRegistry();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.replaceAgentPluginCommands([
      command('portable/server/tool'),
      command('portable/server/tool'),
    ]);
    expect(registry.list().map((entry) => entry.name)).toEqual(['portable/server/tool']);
  });

  it('refreshes discovered tool paths from the provider without restart', () => {
    const registry = new CliRegistry();
    let tools = ['search'];
    registry.setAgentPluginCommandProvider(() => tools.map((tool) => command(`portable/docs/${tool}`)));
    expect(registry.get('portable/docs/search')).toBeDefined();
    tools = ['search', 'fetch'];
    expect(registry.get('portable/docs/fetch')).toBeUndefined();
    registry.refreshAgentPluginCommands();
    expect(registry.list().map((entry) => entry.name)).toEqual([
      'portable/docs/fetch',
      'portable/docs/search',
    ]);
  });

  it('skips an app command that collides with an Agent Plugin command', () => {
    const registry = new CliRegistry();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.replaceAgentPluginCommands([command('portable/docs')]);
    registry.replaceAppCommandsForSession('session', [{
      ...command('portable/docs'),
      source: 'app',
      owner: { kind: 'session-extension', sessionId: 'session', extensionPath: '/fixture/extension.ts' },
    }]);

    expect(registry.list({ sessionId: 'session' }).map((entry) => entry.source)).toEqual(['agent-plugin']);
  });
});
