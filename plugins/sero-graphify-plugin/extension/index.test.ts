import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStateFile } from '../shared/state-io';

const originalSeroHome = process.env.SERO_HOME;

afterEach(() => {
  vi.resetModules();
  if (originalSeroHome === undefined) delete process.env.SERO_HOME;
  else process.env.SERO_HOME = originalSeroHome;
});

describe('graphify workspace creation indexing', () => {
  it('queues sync before enabling a newly created workspace', async () => {
    const seroHome = await mkdtemp(path.join(os.tmpdir(), 'graphify-extension-'));
    process.env.SERO_HOME = seroHome;

    try {
      type RegisteredTool = {
        name: string;
        execute: (...args: unknown[]) => Promise<unknown>;
      };
      const registeredTools: RegisteredTool[] = [];
      const pi = {
        registerTool: vi.fn((tool: RegisteredTool) => registeredTools.push(tool)),
        on: vi.fn(),
      };
      const { default: registerGraphify } = await import('./index');
      registerGraphify(pi as never);
      const indexTool = registeredTools.find((tool) => tool.name === 'graphify_index');

      expect(indexTool).toBeDefined();
      await indexTool!.execute(
        'call-1',
        { action: 'enable', workspaceId: 'new-workspace' },
        undefined,
        undefined,
        { cwd: '/workspace/new-workspace' },
      );

      const state = await readStateFile(path.join(seroHome, 'apps', 'graphify', 'state.json'));
      expect(state?.requests.map(({ action, workspaceId }) => ({ action, workspaceId }))).toEqual([
        { action: 'sync', workspaceId: undefined },
        { action: 'enable', workspaceId: 'new-workspace' },
      ]);
    } finally {
      await rm(seroHome, { recursive: true, force: true });
    }
  });

  it('returns the panel fallback when deferred setup cannot write state', async () => {
    const seroHome = await mkdtemp(path.join(os.tmpdir(), 'graphify-extension-read-only-'));
    process.env.SERO_HOME = seroHome;

    try {
      await writeFile(path.join(seroHome, 'apps'), 'not a directory');
      type RegisteredTool = {
        name: string;
        execute: (...args: unknown[]) => Promise<unknown>;
      };
      const registeredTools: RegisteredTool[] = [];
      const pi = {
        registerTool: vi.fn((tool: RegisteredTool) => registeredTools.push(tool)),
        on: vi.fn(),
      };
      const { default: registerGraphify } = await import('./index');
      registerGraphify(pi as never);
      const indexTool = registeredTools.find((tool) => tool.name === 'graphify_index');

      const result = await indexTool!.execute(
        'call-1',
        { action: 'enable', workspaceId: 'new-workspace' },
        undefined,
        undefined,
        { cwd: '/workspace/new-workspace' },
      );

      expect(result).toMatchObject({
        content: [{
          type: 'text',
          text: expect.stringContaining('Use the Graphify panel instead.'),
        }],
      });
    } finally {
      await rm(seroHome, { recursive: true, force: true });
    }
  });
});
