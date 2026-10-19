import { describe, expect, it } from 'vitest';
import { CliRegistry } from '@electron/cli/core/registry';
import { runSubcommand, type CliSubcommands } from '@electron/cli/core/subcommands';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok } from '@electron/cli/lib/utils';

const context = { workspaceId: 'ws-1' } as CliCommandContext;

function registryWith(subcommands: CliSubcommands): CliRegistry {
  const registry = new CliRegistry();
  registry.register({
    name: 'demo',
    summary: 'Demo',
    subcommands,
    execute: (args, ctx, onUpdate) => runSubcommand(subcommands, args, ctx, onUpdate, {
      fallback: 'info',
      unknown: (action) => action === undefined ? fail('Usage: demo') : fail(`Unknown demo action: ${action}`),
    }),
  });
  return registry;
}

async function run(registry: CliRegistry, tokens: string[]) {
  const resolved = registry.resolveTokens(tokens);
  return registry.executeResolved(resolved, resolved.args, context);
}

describe('CLI subcommand maps', () => {
  const subcommands: CliSubcommands = {
    info: async () => ok('info'),
    echo: async (args) => ok(args.join(',')),
  };

  it('lists exactly the subcommands the command dispatches', () => {
    const registry = registryWith(subcommands);
    expect(registry.subcommandNames('demo')).toEqual(Object.keys(subcommands));
    expect(registry.subcommandNames('unknown')).toEqual([]);
  });

  it('runs the named subcommand with the tokens after it', async () => {
    const registry = registryWith(subcommands);
    await expect(run(registry, ['demo', 'echo', 'a', 'b'])).resolves.toEqual(ok('a,b'));
    await expect(run(registry, ['demo'])).resolves.toEqual(ok('info'));
  });

  it('keeps the command own message for an unknown subcommand', async () => {
    const registry = registryWith(subcommands);
    await expect(run(registry, ['demo', 'nope'])).resolves.toEqual(fail('Unknown demo action: nope'));
    await expect(run(registry, ['demo', 'toString'])).resolves.toEqual(fail('Unknown demo action: toString'));
  });
});
