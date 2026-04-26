import path from 'path';

import { appRuntimeManager, workspaceManager } from '@electron/shared/infra/shared-infra';
import { assertIsSeroPluginFolder } from '@electron/features/workspace/plugin-validation';
import { recreateContainerIfRunning } from '@electron/features/workspace/container-sync';
import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext } from '@electron/cli/core/types';
import { askConfirm } from '@electron/cli/lib/ask-confirm';
import { fail, ok, parseFlags } from '@electron/cli/lib/utils';
import { broadcastToWindows } from '@electron/ipc/lib/window-broadcast';

function notifyWorkspaceChanged(): void {
  broadcastToWindows('sero:workspace:changed');
}

async function reconcileAppRuntimes(reason: string): Promise<void> {
  try {
    await appRuntimeManager.reconcile();
  } catch (error) {
    console.error(`[workspace] Failed to reconcile app runtimes after ${reason}:`, error);
  }
}

function formatWorkspaceList(currentWorkspaceId: string) {
  return async () => {
    const list = await workspaceManager.list();
    if (list.length === 0) return 'No workspaces registered.';
    return list
      .map((ws) => {
        const current = ws.id === currentWorkspaceId ? ' (current)' : '';
        const container = ws.container ? 'container' : 'host';
        return `● ${ws.name} (${ws.id}) [${container}]${current}\n  ${ws.path}`;
      })
      .join('\n');
  };
}

/**
 * Resolve a user-supplied path against the CLI's working directory.
 * Absolute paths are passed through; relative paths are joined with cwd
 * (which the bridged CLI sets to the workspace root for agent calls).
 */
function resolvePluginPath(rawPath: string, cwd: string): string {
  return path.resolve(cwd, rawPath);
}

async function handleMountPlugin(
  rest: string[],
  ctx: CliCommandContext,
) {
  const { positionals, flags } = parseFlags(rest);
  const target = positionals[0];
  if (!target) {
    return fail(
      'Usage: sero workspace mount-plugin <path> [--name <display-name>] [--yes]',
    );
  }

  const resolved = resolvePluginPath(target, ctx.cwd);

  // Validate the folder is a real Sero plugin BEFORE prompting the user.
  // Asking "Mount this folder?" for a folder that will fail validation
  // wastes the user's attention.
  try {
    await assertIsSeroPluginFolder(resolved);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message);
  }

  const wsId = ctx.workspaceId;
  const wsPath = workspaceManager.getPath(wsId);
  if (!wsPath) return fail(`Workspace not found: ${wsId}`);

  // No-op if the path is already attached as a root — return success
  // (idempotent) so repeated agent calls don't error out.
  const existingRoots = await workspaceManager.getRoots(wsId);
  const already = existingRoots.find(
    (r) => path.resolve(r.path) === path.resolve(resolved),
  );
  if (already) {
    return ok(
      `Folder already attached as root "${already.id}" (${already.path}).`,
    );
  }

  const nameFlag = flags.get('name');
  const displayName =
    typeof nameFlag === 'string' && nameFlag.trim()
      ? nameFlag.trim()
      : path.basename(resolved);

  // Confirmation gate. The agent invokes this command with the
  // intention of editing a plugin in-place; the user must approve
  // exposing that folder to the workspace agent before we proceed.
  const skipPrompt = flags.get('yes') === true || flags.get('y') === true;
  if (!skipPrompt) {
    const confirm = await askConfirm({
      prompt:
        `Attach folder "${displayName}" (${resolved}) to workspace "${wsId}" ` +
        `so it is visible in Explorer and editable by the agent? ` +
        `This does not activate the plugin.`,
      yesLabel: 'Attach folder',
      noLabel: 'Cancel',
      signal: ctx.invocation.signal,
    });

    if (!confirm.bridged) {
      return fail(
        'Cannot prompt for confirmation — no UI bridge available. ' +
          'Re-run with --yes to attach without confirmation.',
      );
    }
    if (confirm.cancelled || !confirm.confirmed) {
      return ok(`Cancelled — folder not attached.`);
    }
  }

  const root = await workspaceManager.addRoot(wsId, {
    name: displayName,
    path: resolved,
    kind: 'linked-plugin',
  });

  // Container parity: roots are merged into bind-mounts at container
  // build time, so recreate the container to pick up the new mount.
  await recreateContainerIfRunning(wsId);
  notifyWorkspaceChanged();

  return ok(
    `Attached folder "${root.name}" as root "${root.id}" → ${root.path}`,
  );
}

async function handleWorkspaceCommand(args: string[], ctx: CliCommandContext) {
  const [action = 'info', ...rest] = args;
  const targetId = rest[0] || ctx.workspaceId;

  try {
    switch (action) {
      case 'list': {
        const output = await formatWorkspaceList(ctx.workspaceId)();
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

      case 'create': {
        const { positionals, flags } = parseFlags(rest);
        const name = positionals.join(' ').trim();
        if (!name) return fail('Usage: sero workspace create <name> [--parent <path>]');
        const parentFlag = flags.get('parent');
        const parentPath = typeof parentFlag === 'string' ? parentFlag : undefined;
        const workspace = await workspaceManager.create(name, parentPath);
        await reconcileAppRuntimes('workspace create');
        notifyWorkspaceChanged();
        return ok(`Created workspace: ${workspace.name} (${workspace.id})\n  ${workspace.path}`);
      }

      case 'add-folder': {
        const { positionals, flags } = parseFlags(rest);
        const folderPath = positionals[0];
        if (!folderPath) return fail('Usage: sero workspace add-folder <path> [--name <display-name>]');
        const nameFlag = flags.get('name');
        const name = typeof nameFlag === 'string' ? nameFlag : undefined;
        const workspace = await workspaceManager.addFolder(path.resolve(ctx.cwd, folderPath), name);
        await reconcileAppRuntimes('workspace add-folder');
        notifyWorkspaceChanged();
        return ok(`Added workspace: ${workspace.name} (${workspace.id})\n  ${workspace.path}`);
      }

      case 'open': {
        if (!rest[0]) return fail('Usage: sero workspace open <id>');
        await workspaceManager.open(rest[0]);
        notifyWorkspaceChanged();
        return ok(`Expanded workspace: ${rest[0]}`);
      }

      case 'close': {
        if (!rest[0]) return fail('Usage: sero workspace close <id>');
        if (rest[0] === 'global') return fail('Cannot close the default workspace');
        await workspaceManager.close(rest[0]);
        await reconcileAppRuntimes('workspace close');
        notifyWorkspaceChanged();
        return ok(`Closed workspace: ${rest[0]} (re-add via add-folder to restore)`);
      }

      case 'mount-plugin':
        return handleMountPlugin(rest, ctx);

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
    summary: 'Manage workspaces (list, info, create, add-folder, open, close, mount-plugin)',
    help:
      'workspace — Manage workspaces\n\n' +
      'Usage: sero workspace <action> [args]\n\n' +
      'Actions:\n' +
      '  list                       List workspaces\n' +
      '  info [id]                  Show workspace details (default: current)\n' +
      '  create <name>              Create and register a new workspace\n' +
      '                             Flags: --parent <path>\n' +
      '  add-folder <path>          Register an existing folder as a workspace\n' +
      '                             Flags: --name <display-name>\n' +
      '  open <id>                  Open/expand a workspace\n' +
      '  close <id>                 Close a workspace\n' +
      '  mount-plugin <path>        Attach a Sero plugin source folder as an attached folder\n' +
      '                             (Explorer visibility only; does not activate the plugin).\n' +
      '                             Flags: --name <display-name>, --yes (skip confirmation)\n',
    source: 'ipc',
    group: 'Builtin',
    // Confirmation prompt blocks on user input — disable batch / per-command
    // timeouts so the user has time to answer.
    interactive: true,
    execute: handleWorkspaceCommand,
  });
}
