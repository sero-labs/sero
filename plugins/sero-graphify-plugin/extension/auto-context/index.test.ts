import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerAutoContext } from './index';
import { graphifyPathsFromHome, type GraphifyPaths } from '../../shared/paths';
import { writeStateFile } from '../../shared/state-io';
import { DEFAULT_STATE, type GraphifyState } from '../../shared/types';

const FIXTURE = path.join(__dirname, '..', '..', 'shared', 'query-engine', 'fixtures', 'small-graph.json');

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

interface HomeOptions {
  graph?: boolean;
  report?: string;
  autoContext?: Partial<GraphifyState['settings']['autoContext']>;
}

async function makeEnv(options: HomeOptions = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'graphify-ac-ws-'));
  const home = await mkdtemp(path.join(os.tmpdir(), 'graphify-ac-home-'));
  const paths = graphifyPathsFromHome(home);
  const state: GraphifyState = {
    ...structuredClone(DEFAULT_STATE),
    settings: {
      ...structuredClone(DEFAULT_STATE.settings),
      autoContext: { ...structuredClone(DEFAULT_STATE.settings.autoContext), ...options.autoContext },
    },
    workspaces: {
      ws1: { workspaceId: 'ws1', name: 'One', path: cwd, enabled: true, status: 'idle' },
    },
  };
  await writeStateFile(paths.stateFile, state);
  if (options.graph) {
    const outDir = path.join(paths.graphsDir, 'ws1', 'graphify-out');
    await mkdir(outDir, { recursive: true });
    await copyFile(FIXTURE, path.join(outDir, 'graph.json'));
    if (options.report !== undefined) {
      await writeFile(path.join(outDir, 'GRAPH_REPORT.md'), options.report);
    }
  }
  return { cwd, paths };
}

function register(paths: GraphifyPaths) {
  const { pi, handlers } = createPiStub();
  const registration = registerAutoContext(pi as never, paths);
  return { handlers, registration };
}

const grepEvent = (pattern: string, lineCount = 12) => ({
  toolName: 'grep',
  input: { pattern },
  content: [{ type: 'text', text: Array.from({ length: lineCount }, (_, i) => `match ${i}`).join('\n') }],
});

describe('session orientation', () => {
  it('injects orientation with report snippet when graph exists', async () => {
    const { cwd, paths } = await makeEnv({ graph: true, report: '# Communities\nCore and tools clusters.\n' });
    const { handlers } = register(paths);

    await handlers.get('session_start')?.({}, { cwd });
    const result = await handlers.get('before_agent_start')?.({ systemPrompt: 'base prompt' }, { cwd });

    expect(result).toBeDefined();
    const prompt = (result as { systemPrompt: string }).systemPrompt;
    expect(prompt).toContain('base prompt');
    expect(prompt).toContain('[Graphify active]');
    expect(prompt).toContain('graphify_query');
    expect(prompt).toContain('Communities');
  });

  it('injects only once per session', async () => {
    const { cwd, paths } = await makeEnv({ graph: true });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });
    const first = await handlers.get('before_agent_start')?.({ systemPrompt: 'p' }, { cwd });
    const second = await handlers.get('before_agent_start')?.({ systemPrompt: 'p' }, { cwd });
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });

  it('stays idle when no graph exists', async () => {
    const { cwd, paths } = await makeEnv({});
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });
    expect(await handlers.get('before_agent_start')?.({ systemPrompt: 'p' }, { cwd })).toBeUndefined();
    expect(await handlers.get('tool_result')?.(grepEvent('auth'), { cwd })).toBeUndefined();
  });
});

describe('tool-result augmentation', () => {
  it('appends a graphify hint to broad search results', async () => {
    const { cwd, paths } = await makeEnv({ graph: true });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });

    const result = await handlers.get('tool_result')?.(grepEvent('auth flow'), { cwd });
    expect(result).toBeDefined();
    const content = (result as { content: Array<{ text?: string }> }).content;
    expect(content.at(-1)?.text).toContain('[Graphify]');
    expect(content.at(-1)?.text).toContain('graphify_query');
  });

  it('dedupes identical events', async () => {
    const { cwd, paths } = await makeEnv({ graph: true });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });

    expect(await handlers.get('tool_result')?.(grepEvent('auth'), { cwd })).toBeDefined();
    expect(await handlers.get('tool_result')?.(grepEvent('auth'), { cwd })).toBeUndefined();
  });

  it('enforces the per-session augment budget', async () => {
    const { cwd, paths } = await makeEnv({ graph: true, autoContext: { maxSessionAugments: 2 } });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });

    expect(await handlers.get('tool_result')?.(grepEvent('q1'), { cwd })).toBeDefined();
    expect(await handlers.get('tool_result')?.(grepEvent('q2'), { cwd })).toBeDefined();
    expect(await handlers.get('tool_result')?.(grepEvent('q3'), { cwd })).toBeUndefined();
  });

  it('respects augmentSearchResults=false', async () => {
    const { cwd, paths } = await makeEnv({ graph: true, autoContext: { augmentSearchResults: false } });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });
    expect(await handlers.get('tool_result')?.(grepEvent('auth'), { cwd })).toBeUndefined();
  });

  it('skips small results', async () => {
    const { cwd, paths } = await makeEnv({ graph: true });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });
    expect(await handlers.get('tool_result')?.(grepEvent('auth', 2), { cwd })).toBeUndefined();
  });

  it('runs an in-process auto-query for high-confidence intents when enabled', async () => {
    const { cwd, paths } = await makeEnv({ graph: true, autoContext: { autoQuery: true } });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });

    const result = await handlers.get('tool_result')?.(grepEvent('AuthService internals'), { cwd });
    expect(result).toBeDefined();
    const content = (result as { content: Array<{ text?: string }> }).content;
    // Auto-query answers come from the graph itself (BFS render), not just a hint.
    expect(content.at(-1)?.text).toContain('[Graphify]');
  });

  it('caps augment text at maxAugmentChars', async () => {
    const { cwd, paths } = await makeEnv({ graph: true, autoContext: { maxAugmentChars: 80 } });
    const { handlers } = register(paths);
    await handlers.get('session_start')?.({}, { cwd });

    const result = await handlers.get('tool_result')?.(grepEvent('auth'), { cwd });
    const content = (result as { content: Array<{ text?: string }> }).content;
    const appended = content.at(-1)?.text ?? '';
    // Wrapper adds separators; the bounded body itself is ≤ 80 + ellipsis.
    expect(appended.length).toBeLessThan(120);
  });
});
