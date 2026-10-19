import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { CliRegistry } from '@electron/cli/core/registry';
import { runSubcommand, type CliSubcommands } from '@electron/cli/core/subcommands';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok } from '@electron/cli/lib/utils';

async function readFile(workspaceId: string, filePath: string): Promise<string> {
  const runtime = await runtimeManager.getRuntime(workspaceId);
  return (await runtime.readFile({ path: filePath })).content;
}

async function listFiles(workspaceId: string, dirPath: string): Promise<string> {
  const runtime = await runtimeManager.getRuntime(workspaceId);
  const entries = await runtime.listFiles({ path: dirPath });
  return entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => (entry.type === 'directory' ? `${entry.name}/` : entry.name))
    .join('\n') || '(empty directory)';
}

const EDITOR_SUBCOMMANDS: CliSubcommands = {
  read: async (rest, ctx) => {
    const filePath = rest[0];
    if (!filePath) return fail('Usage: sero editor read <path>');
    return ok(await readFile(ctx.workspaceId, filePath));
  },
  list: async (rest, ctx) => {
    const dirPath = rest[0] ?? '/workspace';
    return ok(await listFiles(ctx.workspaceId, dirPath));
  },
};

async function handleEditor(args: string[], ctx: CliCommandContext) {
  try {
    return await runSubcommand(EDITOR_SUBCOMMANDS, args, ctx, undefined, {
      unknown: () => fail('Usage: sero editor <read|list> ...'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Editor command failed';
    return fail(message);
  }
}

export function registerEditorCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'editor',
    summary: 'Editor filesystem helpers (read, list)',
    help:
      'editor — File operations\n\n' +
      'Usage: sero editor <action> [args]\n\n' +
      'Actions:\n' +
      '  read <path>            Read a file\n' +
      '  list [dir]             List directory entries\n',
    source: 'ipc',
    group: 'Editor',
    subcommands: EDITOR_SUBCOMMANDS,
    execute: handleEditor,
  });
}
