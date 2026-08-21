import os from 'node:os';
import path from 'node:path';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphifyPathsFromHome, workspaceGraphJson } from '../shared/paths';
import { readStateFile, writeStateFile } from '../shared/state-io';
import { CURRENT_INDEX_MODE_VERSION, DEFAULT_STATE, type GraphifyState } from '../shared/types';

const originalSeroHome = process.env.SERO_HOME;
const GRAPH_FIXTURE = path.join(__dirname, '..', 'shared', 'query-engine', 'fixtures', 'small-graph.json');

afterEach(() => {
  vi.resetModules();
  if (originalSeroHome === undefined) delete process.env.SERO_HOME;
  else process.env.SERO_HOME = originalSeroHome;
});

describe('graphify workspace creation indexing', () => {
  it('does not query workspace or profile graphs from the old indexing mode', async () => {
    const seroHome = await mkdtemp(path.join(os.tmpdir(), 'graphify-extension-migration-'));
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-extension-workspace-'));
    process.env.SERO_HOME = seroHome;

    try {
      const paths = graphifyPathsFromHome(path.join(seroHome, 'apps', 'graphify'));
      const graphPath = workspaceGraphJson(paths, 'ws1');
      await mkdir(path.dirname(graphPath), { recursive: true });
      await mkdir(paths.profileDir, { recursive: true });
      await Promise.all([copyFile(GRAPH_FIXTURE, graphPath), copyFile(GRAPH_FIXTURE, paths.profileGraph)]);
      const legacyState = {
        ...structuredClone(DEFAULT_STATE),
        workspaces: {
          ws1: {
            workspaceId: 'ws1', name: 'One', path: cwd, enabled: true,
            status: 'needs-build', lastBuiltAt: 'yesterday',
          },
        },
        profileGraph: { status: 'ready', workspaceIds: ['ws1'] },
      } satisfies GraphifyState;
      await writeStateFile(paths.stateFile, legacyState);

      type RegisteredTool = { name: string; execute: (...args: unknown[]) => Promise<unknown> };
      const registeredTools: RegisteredTool[] = [];
      const pi = { registerTool: vi.fn((tool: RegisteredTool) => registeredTools.push(tool)), on: vi.fn() };
      const { default: registerGraphify } = await import('./index');
      registerGraphify(pi as never);
      const queryTool = registeredTools.find((tool) => tool.name === 'graphify_query');

      const result = await queryTool!.execute('call-1', { question: 'authentication' }, undefined, undefined, { cwd });
      expect(result).toMatchObject({
        content: [{ text: expect.stringMatching(/^Profile graph not built yet/) }],
      });

      await writeStateFile(paths.stateFile, {
        ...legacyState,
        workspaces: {
          ws1: { ...legacyState.workspaces.ws1, indexModeVersion: CURRENT_INDEX_MODE_VERSION },
        },
      });
      const currentResult = await queryTool!.execute('call-2', { question: 'authentication' }, undefined, undefined, { cwd });
      expect(currentResult).toMatchObject({
        content: [{ text: expect.stringMatching(/^Traversal:/) }],
      });
      const searchTool = registeredTools.find((tool) => tool.name === 'graphify_search');
      const searchResult = await searchTool!.execute('call-3', { question: 'authentication' });
      expect(searchResult).toMatchObject({
        content: [{ text: expect.stringMatching(/^Traversal:/) }],
      });
    } finally {
      await Promise.all([
        rm(seroHome, { recursive: true, force: true }),
        rm(cwd, { recursive: true, force: true }),
      ]);
    }
  });

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
      // arbitrary directory would bypass the host workspace boundary.
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
