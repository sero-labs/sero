import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  reloadResources: vi.fn(async () => {}),
  createRuntimeTools: vi.fn(async () => []),
  getRuntime: vi.fn(),
  bindRunCode: vi.fn(),
  // Captures the last DefaultResourceLoader constructor options (e.g. skillsOverride).
  lastLoaderOptions: null as Record<string, unknown> | null,
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: mocks.createAgentSession,
  SessionManager: {
    inMemory: vi.fn((cwd: string) => ({ cwd })),
  },
  DefaultResourceLoader: class {
    constructor(options: Record<string, unknown>) {
      mocks.lastLoaderOptions = options;
    }
    async reload() {
      await mocks.reloadResources();
    }
  },
}));

vi.mock('@electron/features/container/tools', () => ({
  createRuntimeTools: mocks.createRuntimeTools,
}));

vi.mock('@electron/features/code-mode', () => ({
  createRunCodeController: () => ({
    tool: { name: 'run_code', label: 'run code', description: '', parameters: {}, execute: vi.fn() },
    bind: mocks.bindRunCode,
  }),
}));

vi.mock('@electron/features/subagent/runtime/loader', () => ({
  createSubagentExtensionFactory: vi.fn(() => vi.fn()),
}));

vi.mock('@electron/features/subagent/runtime/tool-catalog', () => ({
  recordRunToolCatalog: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: {
    getRuntime: mocks.getRuntime,
  },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/agent',
}));

vi.mock('@electron/ipc/editor/debug', () => ({
  logRawEvent: vi.fn(),
  logTurnContext: vi.fn(),
}));

vi.mock('@electron/features/apps/extensions/skill-visibility', () => ({
  createSkillVisibilityOverride: vi.fn(() => (base: unknown) => base),
}));

vi.mock('@electron/features/plugins/resource-compatibility', () => ({
  filterCompatiblePluginAgentsFiles: (base: unknown) => base,
  filterCompatiblePluginExtensions: (base: unknown) => base,
  filterCompatiblePluginPrompts: (base: unknown) => base,
  filterCompatiblePluginSkills: (base: unknown) => base,
  filterCompatiblePluginThemes: (base: unknown) => base,
}));

vi.mock('@electron/shared/settings/resolve-tier-model', () => ({
  parseModelField: vi.fn(() => null),
  resolveTierModel: vi.fn(() => null),
}));

vi.mock('@electron/shared/settings/model-tiers', () => ({
  getModelTiers: vi.fn(() => ({})),
}));

import { parseModelField } from '@electron/shared/settings/resolve-tier-model';
import { resolveSubagentPaths, runSubagent } from '@electron/features/subagent/runtime/runner';
import type { RunnerConfig } from '@electron/features/subagent/core/types';
import type { RunnerDeps } from '@electron/features/subagent/runtime/runner';

function createSession() {
  const activeTools = [{ name: 'read' }];
  return {
    agent: { state: { tools: activeTools } },
    model: { id: 'claude-test-1', provider: 'anthropic' },
    setThinkingLevel: vi.fn(),
    subscribe: vi.fn((_listener?: (event: Record<string, unknown>) => void) => vi.fn()),
    prompt: vi.fn(async () => {}),
    getAllTools: vi.fn(() => []),
    messages: [],
    getSessionStats: vi.fn(() => ({
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
      cost: 0,
    })),
    abort: vi.fn(),
    dispose: vi.fn(),
  };
}

function createConfig(signal: AbortSignal): RunnerConfig {
  return {
    agent: {
      name: 'factory-test',
      description: 'test agent',
      systemPrompt: 'You are a test agent.',
      source: 'global',
      filePath: '',
    },
    task: 'do the thing',
    resolved: {
      model: 'claude-test-1',
      modelSelection: 'claude-test-1',
      thinking: 'off',
      thinkingSource: 'default',
      timeoutMs: 60_000,
      toolStallTimeoutMs: 0,
    },
    workspaceId: 'ws-1',
    parentSessionId: 'parent-1',
    mode: 'single',
    signal,
    platformTools: 'none',
  };
}

function createDeps(): RunnerDeps {
  return {
    infra: {
      modelRuntime: {},
      modelRegistry: {
        getAvailable: vi.fn(() => []),
        find: vi.fn(() => null),
      },
      settingsManager: {
        getGlobalSettings: vi.fn(() => ({})),
      },
    },
    workspaceManager: {
      getPath: vi.fn(() => '/workspace'),
    },
  } as unknown as RunnerDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reloadResources.mockResolvedValue(undefined);
  mocks.createRuntimeTools.mockResolvedValue([]);
  mocks.getRuntime.mockResolvedValue({
    backend: 'host',
    ensure: vi.fn(async () => {}),
  });
});

describe('resolveSubagentPaths', () => {
  it('keeps the container root at the workspace while targeting a worktree cwd', () => {
    const resolved = resolveSubagentPaths(
      '/Users/me/project',
      '/Users/me/project/.sero/worktrees/card-5',
    );

    expect(resolved.sessionPath).toBe('/Users/me/project/.sero/worktrees/card-5');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBe('/workspace/.sero/worktrees/card-5');
  });

  it('uses the workspace root directly when there is no cwd override', () => {
    const resolved = resolveSubagentPaths('/Users/me/project');

    expect(resolved.sessionPath).toBe('/Users/me/project');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBeUndefined();
  });

  it('falls back cleanly when the override is outside the workspace root', () => {
    const resolved = resolveSubagentPaths(
      '/Users/me/project',
      '/tmp/outside',
    );

    expect(resolved.sessionPath).toBe('/tmp/outside');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBeUndefined();
  });
});

function createStreamingSession(events: Array<Record<string, unknown>>) {
  const session = createSession();
  let listener: ((event: Record<string, unknown>) => void) | null = null;
  session.subscribe = vi.fn((cb?: (event: Record<string, unknown>) => void) => {
    listener = cb ?? null;
    return vi.fn();
  });
  session.prompt = vi.fn(async () => {
    for (const event of events) listener?.(event);
  });
  return session;
}

describe('runSubagent live output', () => {
  it('does not prompt the default provider when a selected model cannot resolve', async () => {
    const session = createSession();
    mocks.createAgentSession.mockResolvedValue({ session });
    vi.mocked(parseModelField).mockReturnValueOnce({ prefer: 'openai-codex/missing', fallbacks: [] });
    const result = await runSubagent(createConfig(new AbortController().signal), createDeps());
    expect(result.error).toContain('Selected model openai-codex/missing is unavailable');
    expect(session.prompt).not.toHaveBeenCalled();
  });

  it('reports priced cumulative usage after each model turn, before the helper finishes', async () => {
    const session = createStreamingSession([{ type: 'turn_end' }]);
    session.getSessionStats.mockReturnValue({
      tokens: { input: 100, output: 50, cacheRead: 100000, cacheWrite: 500, total: 100650 },
      cost: 0.03,
    });
    const prompt = session.prompt;
    let finished = false;
    session.prompt = vi.fn(async () => { await prompt(); finished = true; });
    mocks.createAgentSession.mockResolvedValueOnce({ session });
    const config = createConfig(new AbortController().signal);
    const progress = vi.fn(() => { expect(finished).toBe(false); });
    config.onProgress = progress;
    const result = await runSubagent(config, createDeps());
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ cost: 0.03, cacheReadTokens: 100000, totalTokens: 100650 }));
    expect(result.usage.cost).toBe(0.03);
  });

  it('keeps priced live usage and marks the result incomplete when final stats fail', async () => {
    const session = createStreamingSession([{ type: 'turn_end' }]);
    session.getSessionStats
      .mockReturnValueOnce({
        tokens: { input: 100, output: 50, cacheRead: 1000, cacheWrite: 20, total: 1170 },
        cost: 0.03,
      })
      .mockImplementationOnce(() => { throw new Error('stats unavailable'); });
    mocks.createAgentSession.mockResolvedValueOnce({ session });

    const progress = vi.fn();
    const config = createConfig(new AbortController().signal);
    config.onProgress = progress;
    const result = await runSubagent(config, createDeps());

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ cost: 0.03, totalTokens: 1170 }));
    expect(result.usage).toMatchObject({ cost: 0.03, totalTokens: 1170, incomplete: true });
  });

  it('keeps priced live usage and marks the result incomplete when prompt throws', async () => {
    const session = createStreamingSession([{ type: 'turn_end' }]);
    session.getSessionStats
      .mockReturnValueOnce({
        tokens: { input: 80, output: 40, cacheRead: 500, cacheWrite: 10, total: 630 },
        cost: 0.02,
      })
      .mockImplementationOnce(() => { throw new Error('stats unavailable'); });
    const emitTurn = session.prompt;
    session.prompt = vi.fn(async () => {
      await emitTurn();
      throw new Error('prompt interrupted');
    });
    mocks.createAgentSession.mockResolvedValueOnce({ session });

    const result = await runSubagent(createConfig(new AbortController().signal), createDeps());

    expect(result.error).toBe('prompt interrupted');
    expect(result.usage).toMatchObject({ cost: 0.02, totalTokens: 630, incomplete: true });
  });

  it('reports incomplete live usage when a turn-end stats read fails', async () => {
    const session = createStreamingSession([{ type: 'turn_end' }]);
    session.getSessionStats.mockImplementation(() => { throw new Error('stats unavailable'); });
    mocks.createAgentSession.mockResolvedValueOnce({ session });

    const progress = vi.fn();
    const config = createConfig(new AbortController().signal);
    config.onProgress = progress;
    await runSubagent(config, createDeps());

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ incomplete: true }));
  });

  it('forwards both text and reasoning deltas into the live-output channel', async () => {
    const session = createStreamingSession([
      { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'weighing options…' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'final answer' } },
    ]);
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session }));

    const deltas: string[] = [];
    const config = createConfig(new AbortController().signal);
    config.onTextDelta = (delta) => deltas.push(delta);

    await runSubagent(config, createDeps());

    expect(deltas).toEqual(['weighing options…', 'final answer']);
  });
});

describe('runSubagent abort handling', () => {
  it.each(['timeout', 'stall'] as const)('reports %s without repairing an interrupted reply', async (kind) => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      mocks.createAgentSession.mockResolvedValueOnce({ session });
      session.getSessionStats.mockReturnValue({
        tokens: { input: 100, output: 20, cacheRead: 40, cacheWrite: 0, total: 160 }, cost: 0.42,
      });
      const config = createConfig(new AbortController().signal);
      config.resolved.timeoutMs = 100;
      config.resolved.toolStallTimeoutMs = kind === 'stall' ? 50 : 0;
      const validate = vi.fn(() => 'Return a structured outcome.');
      config.repair = { maxAttempts: 1, validate };
      session.prompt.mockImplementation(async () => {
        if (kind === 'stall') {
          session.subscribe.mock.calls.at(-1)?.[0]?.({ type: 'tool_execution_start', toolName: 'bash', args: {} });
        }
        await vi.advanceTimersByTimeAsync(kind === 'stall' ? 50 : 100);
      });

      const result = await runSubagent(config, createDeps());

      expect(result.error).toContain(kind === 'stall' ? "Tool 'bash' stalled" : 'Timed out');
      expect(session.abort).toHaveBeenCalledOnce();
      expect(session.prompt).toHaveBeenCalledOnce();
      expect(validate).not.toHaveBeenCalled();
      expect(result.usage).toMatchObject({ totalTokens: 160, cost: 0.42 });
      expect(session.dispose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns before creating a session when setup is aborted', async () => {
    const controller = new AbortController();
    mocks.reloadResources.mockImplementationOnce(async () => {
      controller.abort();
    });

    const result = await runSubagent(createConfig(controller.signal), createDeps());

    expect(result.error).toBe('Aborted before start');
    expect(mocks.createAgentSession).not.toHaveBeenCalled();
  });

  it('does not prompt when the signal aborts while the session is being created', async () => {
    const controller = new AbortController();
    const session = createSession();
    mocks.createAgentSession.mockImplementationOnce(async () => {
      controller.abort();
      return { session };
    });

    const result = await runSubagent(createConfig(controller.signal), createDeps());

    expect(result.error).toBe('Aborted');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.providerId).toBe('anthropic');
    expect(session.abort).toHaveBeenCalledTimes(1);
    expect(session.prompt).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('runSubagent context overrides', () => {
  it('binds run_code to the completed session active tools', async () => {
    const session = createSession();
    mocks.createAgentSession.mockResolvedValueOnce({ session });

    await runSubagent(createConfig(new AbortController().signal), createDeps());

    expect(mocks.bindRunCode).toHaveBeenCalledOnce();
    expect(mocks.bindRunCode).toHaveBeenCalledWith(session.agent);
  });

  it('drops disabled tools from the session tool surface', async () => {
    mocks.createRuntimeTools.mockResolvedValueOnce([
      { name: 'bash', description: '', parameters: {}, execute: vi.fn() },
      { name: 'read', description: '', parameters: {}, execute: vi.fn() },
    ] as never);
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.platformTools = 'all';
    config.disabledTools = ['bash'];

    await runSubagent(config, createDeps());

    const options = mocks.createAgentSession.mock.calls[0][0] as { customTools: { name: string }[] };
    const names = options.customTools.map((t) => t.name);
    expect(names).toContain('read');
    expect(names).toContain('run_code');
    expect(names).not.toContain('bash');
  });

  it('can disable run_code through the existing disabled-tools policy', async () => {
    mocks.createAgentSession.mockResolvedValueOnce({ session: createSession() });
    const config = createConfig(new AbortController().signal);
    config.disabledTools = ['run_code'];

    await runSubagent(config, createDeps());

    const options = mocks.createAgentSession.mock.calls[0][0] as { customTools: { name: string }[] };
    expect(options.customTools.map((tool) => tool.name)).not.toContain('run_code');
  });

  it('applies a per-step tool allowlist to the session', async () => {
    mocks.createRuntimeTools.mockResolvedValueOnce([
      { name: 'bash', description: '', parameters: {}, execute: vi.fn() },
      { name: 'read', description: '', parameters: {}, execute: vi.fn() },
      { name: 'web_search', description: '', parameters: {}, execute: vi.fn() },
    ] as never);
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.platformTools = 'all';
    config.tools = ['bash', 'web_search'];

    await runSubagent(config, createDeps());

    const options = mocks.createAgentSession.mock.calls[0][0] as { noTools?: string; tools?: string[] };
    expect(options.noTools).toBe('builtin');
    expect(options.tools).toEqual(['bash', 'web_search']);
  });

  it.each([
    {
      label: 'an explicit override',
      systemPromptOverride: 'You are a terse reviewer.',
    },
    {
      label: 'no override',
      systemPromptOverride: undefined,
    },
  ])('passes $label through the resource loader override', async ({ systemPromptOverride }) => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.systemPromptOverride = systemPromptOverride;

    await runSubagent(config, createDeps());

    const override = mocks.lastLoaderOptions?.systemPromptOverride as
      | ((base: string | undefined) => string | undefined)
      | undefined;
    if (systemPromptOverride) {
      expect(override?.('original base prompt')).toBe('You are a terse reviewer.');
    } else {
      expect(mocks.lastLoaderOptions?.systemPromptOverride).toBeUndefined();
    }
  });

  it('delivers the agent prompt via the resource loader appendSystemPrompt slot', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    await runSubagent(createConfig(new AbortController().signal), createDeps());

    // The agent .md body / step contract must ride on appendSystemPrompt so it
    // survives a base systemPromptOverride. The dead systemPromptSuffix option
    // must no longer be passed to createAgentSession.
    expect(mocks.lastLoaderOptions?.appendSystemPrompt).toEqual(['You are a test agent.']);
    const sessionOptions = mocks.createAgentSession.mock.calls[0][0] as Record<string, unknown>;
    expect(sessionOptions.systemPromptSuffix).toBeUndefined();
  });

  it('appends a caller appendSystemPrompt after the agent body (so a step contract survives a named agent)', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.appendSystemPrompt = ['STEP CONTRACT: emit the outcome envelope.'];

    await runSubagent(config, createDeps());

    expect(mocks.lastLoaderOptions?.appendSystemPrompt).toEqual([
      'You are a test agent.',
      'STEP CONTRACT: emit the outcome envelope.',
    ]);
  });

  it('hides disabled skills from the model via the resource loader override', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.disabledSkills = ['secret-skill'];

    await runSubagent(config, createDeps());

    const skillsOverride = mocks.lastLoaderOptions?.skillsOverride as (
      base: { skills: { name: string; disableModelInvocation?: boolean }[]; diagnostics: unknown[] },
    ) => { skills: { name: string; disableModelInvocation?: boolean }[] };
    const result = skillsOverride({
      skills: [{ name: 'secret-skill' }, { name: 'ok-skill' }],
      diagnostics: [],
    });
    const secret = result.skills.find((s) => s.name === 'secret-skill');
    const ok = result.skills.find((s) => s.name === 'ok-skill');
    expect(secret?.disableModelInvocation).toBe(true);
    expect(ok?.disableModelInvocation).toBeUndefined();
  });
});
