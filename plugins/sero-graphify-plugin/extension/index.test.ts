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
  it('queues an enable by id and never carries a path', async () => {
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
        {
          action: 'enable',
          workspaceId: 'new-workspace',
          workspaceName: 'New Workspace',
          workspacePath: '/workspace/new-workspace',
        },
        undefined,
        undefined,
        { cwd: '/workspace/new-workspace' },
      );

      const state = await readStateFile(path.join(seroHome, 'apps', 'graphify', 'state.json'));
      // One request, carrying an id the runtime re-checks against the host
      // workspace registry. A path never travels: pointing an extraction at an
      // arbitrary directory is how an agent could spend money on anything on
      // the machine, and how a build could be paid for and then thrown away.
      expect(state?.requests).toMatchObject([{ action: 'enable', workspaceId: 'new-workspace' }]);
      expect(JSON.stringify(state?.requests)).not.toContain('/workspace/new-workspace');
    } finally {
      await rm(seroHome, { recursive: true, force: true });
    }
  });

  it('returns an error when the requested workspace cannot be resolved', async () => {
    const seroHome = await mkdtemp(path.join(os.tmpdir(), 'graphify-extension-missing-workspace-'));
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

      const result = await indexTool!.execute(
        'call-1',
        { action: 'enable', workspace: 'missing-workspace' },
        undefined,
        undefined,
        { cwd: '/workspace/missing-workspace' },
      );

      expect(result).toMatchObject({
        content: [{
          type: 'text',
          text: expect.stringMatching(/^Error: Could not resolve workspace/),
        }],
      });
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
        {
          action: 'enable',
          workspaceId: 'new-workspace',
          workspaceName: 'New Workspace',
          workspacePath: '/workspace/new-workspace',
        },
        undefined,
        undefined,
        { cwd: '/workspace/new-workspace' },
      );

      expect(result).toMatchObject({
        content: [{
          type: 'text',
          text: expect.stringMatching(/^Error: .*Use the Graphify panel instead\.$/),
        }],
      });
    } finally {
      await rm(seroHome, { recursive: true, force: true });
    }
  });
});
