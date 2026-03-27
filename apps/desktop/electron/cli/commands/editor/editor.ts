import { promises as fs } from 'node:fs';
import path from 'node:path';
import { containerManager, workspaceManager } from '../../../shared/infra/shared-infra';
import type { CliRegistry } from '../../core/registry';
import type { CliCommandContext } from '../../core/types';
import { fail, ok } from '../../lib/utils';

const WORKSPACE_PREFIX = '/workspace';

function toHostPath(workspacePath: string, filePath: string): string {
  const raw = filePath.startsWith(WORKSPACE_PREFIX)
    ? path.join(workspacePath, filePath.slice(WORKSPACE_PREFIX.length))
    : path.join(workspacePath, filePath);

  const resolved = path.resolve(raw);
  const root = path.resolve(workspacePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return resolved;
}

async function readFile(workspaceId: string, filePath: string): Promise<string> {
  const useContainer = (await workspaceManager.isContainerEnabled(workspaceId)) && containerManager.hasContainer(workspaceId);
  if (useContainer) return containerManager.readFile(workspaceId, filePath);

  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
  return fs.readFile(toHostPath(wsPath, filePath), 'utf8');
}

async function listFiles(workspaceId: string, dirPath: string): Promise<string> {
  const useContainer = (await workspaceManager.isContainerEnabled(workspaceId)) && containerManager.hasContainer(workspaceId);
  if (useContainer) {
    const entries = await containerManager.listFiles(workspaceId, dirPath);
    return entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => (e.type === 'directory' ? `${e.name}/` : e.name))
      .join('\n') || '(empty directory)';
  }

  const wsPath = workspaceManager.getPath(workspaceId);
  if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
  const absDir = toHostPath(wsPath, dirPath);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  return entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .join('\n') || '(empty directory)';
}

async function handleEditor(args: string[], _ctx: CliCommandContext) {
  const [action, ...rest] = args;
  const ctx = _ctx;

  try {
    switch (action) {
      case 'read': {
        const filePath = rest[0];
        if (!filePath) return fail('Usage: sero editor read <path>');
        return ok(await readFile(ctx.workspaceId, filePath));
      }

      case 'list': {
        const dirPath = rest[0] ?? '/workspace';
        return ok(await listFiles(ctx.workspaceId, dirPath));
      }

      default:
        return fail('Usage: sero editor <read|list> ...');
    }
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
    execute: handleEditor,
  });
}
