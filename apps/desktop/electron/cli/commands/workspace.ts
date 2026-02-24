import { workspaceManager } from '../../ipc/shared-infra';
import type { CliRegistry } from '../registry';
import type { CliCommandContext } from '../types';
import { fail, ok } from './utils';

function formatWorkspaceList(currentWorkspaceId: string, openIds: Set<string>) {
  return async () => {
    const list = await workspaceManager.list();
    if (list.length === 0) return 'No workspaces registered.';
    return list
      .map((ws) => {
        const open = openIds.has(ws.id) ? '●' : '○';
        const current = ws.id === currentWorkspaceId ? ' (current)' : '';
        const container = ws.container ? 'container' : 'host';
        return `${open} ${ws.name} (${ws.id}) [${container}]${current}\n  ${ws.path}`;
      })
      .join('\n');
  };
}

async function handleWorkspaceCommand(args: string[], ctx: CliCommandContext) {
  const [action = 'info', ...rest] = args;
  const targetId = rest[0] || ctx.workspaceId;

  try {
    switch (action) {
      case 'list': {
        const openIds = new Set(workspaceManager.getOpenIds());
        const output = await formatWorkspaceList(ctx.workspaceId, openIds)();
        return ok(output);
      }

      case 'info': {
        const config = await workspaceManager.getConfig(targetId);
        const path = workspaceManager.getPath(targetId);
        if (!config || !path) return fail(`Workspace not found: ${targetId}`);
        const enabled = await workspaceManager.isContainerEnabled(targetId);
        const lines = [
          `Workspace: ${config.name} (${targetId})`,
          `Path: ${path}`,
          `Runtime: ${enabled ? 'container' : 'host filesystem'}`,
        ];
        if (config.description) lines.push(`Description: ${config.description}`);
        if (config.contextHints?.length) lines.push(`Context hints: ${config.contextHints.join(', ')}`);
        if (config.tags?.length) lines.push(`Tags: ${config.tags.join(', ')}`);
        return ok(lines.join('\n'));
      }

      case 'open': {
        if (!rest[0]) return fail('Usage: sero workspace open <id>');
        await workspaceManager.open(rest[0]);
        return ok(`Opened workspace: ${rest[0]}`);
      }

      case 'close': {
        if (!rest[0]) return fail('Usage: sero workspace close <id>');
        await workspaceManager.close(rest[0]);
        return ok(`Closed workspace: ${rest[0]}`);
      }

      default:
        return fail(`Unknown workspace action: ${action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workspace command failed';
    return fail(message);
  }
}

export function registerWorkspaceCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'workspace',
    summary: 'Manage workspaces (list, info, open, close)',
    help:
      'workspace — Manage workspaces\n\n' +
      'Usage: sero workspace <action> [args]\n\n' +
      'Actions:\n' +
      '  list                 List workspaces\n' +
      '  info [id]            Show workspace details (default: current)\n' +
      '  open <id>            Open a workspace\n' +
      '  close <id>           Close a workspace\n',
    source: 'ipc',
    group: 'Builtin',
    execute: handleWorkspaceCommand,
  });
}
