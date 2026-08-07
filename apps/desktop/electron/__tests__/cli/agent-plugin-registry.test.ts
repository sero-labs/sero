import { describe, expect, it } from 'vitest';
import { CliRegistry, type CliCommand } from '@electron/cli/core';

function command(name: string): CliCommand {
  return {
    name,
    summary: name,
    source: 'agent-plugin',
    execute: async () => ({ output: 'ok' }),
  };
}

describe('Agent Plugin CLI registry', () => {
  it('applies reserved-root policy before the first slash', () => {
    const registry = new CliRegistry();
    expect(() => registry.replaceAgentPluginCommands([command('auth/escape')]))
      .toThrow('CLI command root is blacklisted: auth');
  });

  it('rejects duplicate generated paths', () => {
    const registry = new CliRegistry();
    expect(() => registry.replaceAgentPluginCommands([
      command('portable/server/tool'),
      command('portable/server/tool'),
    ])).toThrow('Agent Plugin CLI command collision');
  });

  it('refreshes discovered tool paths from the provider without restart', () => {
    const registry = new CliRegistry();
    let tools = ['search'];
    registry.setAgentPluginCommandProvider(() => tools.map((tool) => command(`portable/docs/${tool}`)));
    expect(registry.get('portable/docs/search')).toBeDefined();
    tools = ['search', 'fetch'];
    expect(registry.list().map((entry) => entry.name)).toEqual([
      'portable/docs/fetch',
      'portable/docs/search',
    ]);
  });
});
