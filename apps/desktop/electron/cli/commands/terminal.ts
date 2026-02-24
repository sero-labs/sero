import { containerManager } from '../../ipc/shared-infra';
import type { CliRegistry } from '../registry';
import type { CliCommandContext } from '../types';
import { fail, ok } from './utils';

const DEFAULT_LINES = 100;
const MAX_LINES = 500;

async function handleTerminal(args: string[], ctx: CliCommandContext) {
  const [action = 'read', ...rest] = args;

  try {
    switch (action) {
      case 'read': {
        const linesRaw = rest[0];
        const requestedLines = linesRaw ? Number(linesRaw) : DEFAULT_LINES;
        if (!Number.isFinite(requestedLines) || requestedLines <= 0) return fail(`Invalid line count: ${linesRaw}`);
        const wasCapped = requestedLines > MAX_LINES;
        const lines = Math.min(Math.floor(requestedLines), MAX_LINES);
        const output = containerManager.terminals.readWorkspaceTerminalOutput(ctx.workspaceId, lines);
        if (wasCapped) {
          return ok(`${output}\n\n⚠️ Output truncated to ${MAX_LINES} lines (requested ${Math.floor(requestedLines)}). Use a smaller line count to focus on recent output.`);
        }
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
      'Usage: sero terminal read [lines]\n' +
      `Default: ${DEFAULT_LINES} lines. Maximum: ${MAX_LINES} lines.\n`,
    source: 'ipc',
    group: 'Terminal',
    execute: handleTerminal,
  });
}
