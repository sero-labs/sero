import { containerManager } from '../../ipc/shared-infra';
import type { CliRegistry } from '../registry';
import type { CliCommandContext } from '../types';
import { fail, ok } from './utils';

async function handleTerminal(args: string[], ctx: CliCommandContext) {
  const [action = 'read', ...rest] = args;

  try {
    switch (action) {
      case 'read': {
        const linesRaw = rest[0];
        const lines = linesRaw ? Number(linesRaw) : 80;
        if (!Number.isFinite(lines) || lines <= 0) return fail(`Invalid line count: ${linesRaw}`);
        const output = containerManager.terminals.readWorkspaceTerminalOutput(ctx.workspaceId, Math.floor(lines));
        return ok(output);
      }
      default:
        return fail('Usage: sero terminal read [lines]');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terminal command failed';
    return fail(message);
  }
}

export function registerTerminalCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'terminal',
    summary: 'Read terminal output (read)',
    help:
      'terminal — Terminal helpers\n\n' +
      'Usage: sero terminal read [lines]\n',
    source: 'ipc',
    group: 'Terminal',
    execute: handleTerminal,
  });
}
