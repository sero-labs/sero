import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerRefreshOnEdit } from './refresh-on-edit';
import { graphifyPathsFromHome } from '../shared/paths';
import { readStateFile, writeStateFile } from '../shared/state-io';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';

type HookHandler = (event: unknown, ctx: { cwd: string }) => Promise<unknown>;

function createPiStub() {
  const handlers = new Map<string, HookHandler>();
  const pi = {
    registerTool: vi.fn(),
    on: vi.fn((event: string, handler: HookHandler) => {
      handlers.set(event, handler);
    }),
  };
  return { pi, handlers };
}

async function makeEnv(options: { enabled?: boolean } = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-roe-ws-'));
  const home = await mkdtemp(path.join(os.tmpdir(), 'graphify-roe-home-'));
  const paths = graphifyPathsFromHome(home);
  const state: GraphifyState = {
    ...structuredClone(DEFAULT_STATE),
    workspaces: {
      ws1: { workspaceId: 'ws1', name: 'One', path: cwd, enabled: options.enabled ?? true, status: 'idle' },
    },
  };
  await writeStateFile(paths.stateFile, state);
  return { cwd, paths };
}

async function requests(stateFile: string) {
  return (await readStateFile(stateFile))?.requests ?? [];
}

describe('registerRefreshOnEdit', () => {
  it('queues one refresh after an agent run that edited files in an enabled workspace', async () => {
    const { cwd, paths } = await makeEnv();
    const { pi, handlers } = createPiStub();
    registerRefreshOnEdit(pi as never, paths);

    await handlers.get('tool_execution_end')!({ toolName: 'edit', isError: false }, { cwd });
    await handlers.get('agent_end')!({}, { cwd });
    expect(await requests(paths.stateFile)).toMatchObject([{ action: 'refresh', workspaceId: 'ws1' }]);

    // The dirty flag resets: a second agent run with no edits queues nothing.
    await handlers.get('agent_end')!({}, { cwd });
    expect(await requests(paths.stateFile)).toHaveLength(1);
  });

  it('treats bash as potentially mutating', async () => {
    const { cwd, paths } = await makeEnv();
    const { pi, handlers } = createPiStub();
    registerRefreshOnEdit(pi as never, paths);

    await handlers.get('tool_execution_end')!({ toolName: 'bash', isError: false }, { cwd });
    await handlers.get('agent_end')!({}, { cwd });
    expect(await requests(paths.stateFile)).toMatchObject([{ action: 'refresh', workspaceId: 'ws1' }]);
  });

  it('queues nothing for read-only runs or failed tool calls', async () => {
    const { cwd, paths } = await makeEnv();
    const { pi, handlers } = createPiStub();
    registerRefreshOnEdit(pi as never, paths);

    await handlers.get('tool_execution_end')!({ toolName: 'read', isError: false }, { cwd });
    await handlers.get('tool_execution_end')!({ toolName: 'edit', isError: true }, { cwd });
    await handlers.get('agent_end')!({}, { cwd });
    expect(await requests(paths.stateFile)).toHaveLength(0);
  });

  it('never queues a refresh for a workspace the user disabled', async () => {
    const { cwd, paths } = await makeEnv({ enabled: false });
    const { pi, handlers } = createPiStub();
    registerRefreshOnEdit(pi as never, paths);

    await handlers.get('tool_execution_end')!({ toolName: 'write', isError: false }, { cwd });
    await handlers.get('agent_end')!({}, { cwd });
    expect(await requests(paths.stateFile)).toHaveLength(0);
  });

  it('session_start in a workspace unknown to graphify queues a sync', async () => {
    const { paths } = await makeEnv();
    const { pi, handlers } = createPiStub();
    registerRefreshOnEdit(pi as never, paths);

    const stranger = await mkdtemp(path.join(os.tmpdir(), 'graphify-roe-stranger-'));
    await handlers.get('session_start')!({}, { cwd: stranger });
    expect(await requests(paths.stateFile)).toMatchObject([{ action: 'sync' }]);
  });

  it('session_start in a known workspace queues nothing', async () => {
    const { cwd, paths } = await makeEnv();
    const { pi, handlers } = createPiStub();
    registerRefreshOnEdit(pi as never, paths);

    await handlers.get('session_start')!({}, { cwd });
    expect(await requests(paths.stateFile)).toHaveLength(0);
  });
});
