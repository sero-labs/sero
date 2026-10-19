import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ToolProbe } from '../types';
import { expectText } from '../expect';

/** A folder outside the workspace, made by the test for add-folder and mount-plugin. */
function scratchFolder(ctx: { state: Record<string, unknown> }, key: string, files: Record<string, string> = {}): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `sero-tool-check-${key}-`)));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  ctx.state[key] = dir;
  return dir;
}

export const seroWorkspaceProbe: ToolProbe = {
  tool: 'sero workspace',
  steps: [
    { action: 'list', params: { argv: ['list'] }, expect: (result) => expectText(result, 'Tool Check') },
    { action: 'info', params: { argv: ['info'] }, expect: (result) => expectText(result, 'Workspace: Tool Check') },
    {
      action: 'access-roots',
      params: { argv: ['access-roots', '--json'] },
      expect(result, ctx) {
        const parsed = JSON.parse(result.text) as { workspaceId: string; roots: unknown[] };
        if (parsed.workspaceId !== ctx.workspaceId || parsed.roots.length === 0) throw new Error(`unexpected access roots: ${result.text}`);
      },
    },
    {
      action: 'create',
      params: { argv: ['create', 'Tool Check Created'] },
      expect(result, ctx) {
        expectText(result, 'Created workspace: Tool Check Created');
        const id = /\(([^)]+)\)/.exec(result.text)?.[1];
        const folder = result.text.split('\n')[1]?.trim();
        if (!id || !folder || !fs.existsSync(folder)) throw new Error(`no new workspace folder: ${result.text}`);
        ctx.state.createdId = id;
      },
    },
    {
      action: 'add-folder',
      setup: async (ctx) => { scratchFolder(ctx, 'added'); },
      params: (ctx) => ({ argv: ['add-folder', String(ctx.state.added), '--name', 'Tool Check Added'] }),
      expect(result, ctx) {
        expectText(result, 'Added workspace: Tool Check Added');
        ctx.state.addedId = /\(([^)]+)\)/.exec(result.text)?.[1];
      },
    },
    {
      action: 'open',
      params: (ctx) => ({ argv: ['open', String(ctx.state.addedId)] }),
      expect: (result, ctx) => expectText(result, `Expanded workspace: ${String(ctx.state.addedId)}`),
    },
    {
      action: 'close',
      params: (ctx) => ({ argv: ['close', String(ctx.state.addedId)] }),
      expect: (result, ctx) => expectText(result, `Closed workspace: ${String(ctx.state.addedId)}`),
    },
    {
      // A closed workspace is gone from the list.
      action: 'list',
      params: { argv: ['list'] },
      expect(result, ctx) {
        expectText(result, 'Tool Check Created');
        if (result.text.includes(String(ctx.state.addedId))) throw new Error(`closed workspace still listed: ${result.text}`);
      },
    },
    {
      action: 'mount-plugin',
      setup: async (ctx) => {
        scratchFolder(ctx, 'plugin', { 'package.json': JSON.stringify({ name: 'tool-check-plugin', sero: { app: { id: 'tool-check', name: 'Tool Check Plugin' } } }) });
      },
      params: (ctx) => ({ argv: ['mount-plugin', String(ctx.state.plugin), '--name', 'Tool Check Plugin', '--yes'] }),
      expect: (result) => expectText(result, 'Attached folder "Tool Check Plugin"'),
    },
    {
      // The attached folder is now one of the workspace's access roots.
      action: 'access-roots',
      params: { argv: ['access-roots'] },
      expect: (result) => expectText(result, 'Tool Check Plugin'),
    },
  ],
};
