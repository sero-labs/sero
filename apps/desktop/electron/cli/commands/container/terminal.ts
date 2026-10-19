import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { CliRegistry } from '@electron/cli/core/registry';
import { runSubcommand, type CliSubcommands } from '@electron/cli/core/subcommands';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok } from '@electron/cli/lib/utils';

const DEFAULT_LINES = 100;
const MAX_LINES = 500;

async function handleRead(rest: string[], ctx: CliCommandContext) {
  const linesRaw = rest[0];
  const requestedLines = linesRaw ? Number(linesRaw) : DEFAULT_LINES;
  if (!Number.isFinite(requestedLines) || requestedLines <= 0) return fail(`Invalid line count: ${linesRaw}`);
  const wasCapped = requestedLines > MAX_LINES;
  const lines = Math.min(Math.floor(requestedLines), MAX_LINES);
  const output = runtimeManager.readWorkspaceTerminalOutput(ctx.workspaceId, lines);
  if (wasCapped) {
    return ok(`${output}\n\n⚠️ Output truncated to ${MAX_LINES} lines (requested ${Math.floor(requestedLines)}). Use a smaller line count to focus on recent output.`);
  }
  return ok(output);
}

const TERMINAL_SUBCOMMANDS: CliSubcommands = { read: handleRead };

async function handleTerminal(args: string[], ctx: CliCommandContext) {
  try {
    return await runSubcommand(TERMINAL_SUBCOMMANDS, args, ctx, undefined, {
      fallback: 'read',
      unknown: () => fail('Usage: sero terminal read [lines]'),
    });
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
    subcommands: TERMINAL_SUBCOMMANDS,
    execute: handleTerminal,
  });
}
