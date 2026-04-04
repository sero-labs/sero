import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkBootstrapStatus: vi.fn(async () => ({ needsBootstrap: false, existingUserContent: null })),
  getAutoRetrieveModeSync: vi.fn((): 'on' | 'off' => 'on'),
  getMemorySnapshotModeSync: vi.fn(() => 'live' as const),
  buildPriorityContextSplit: vi.fn(),
  clearPriorityContextCache: vi.fn(),
  isQmdAvailable: vi.fn(() => true),
  runQmdUpdateNow: vi.fn(async () => {}),
  runPhase1Migration: vi.fn(async () => ({ changed: false, notes: [] })),
  flushPendingStats: vi.fn(async () => {}),
  getMemoryInstructions: vi.fn(() => '\n\n## Memory System'),
  logMemoryPromptAgentStart: vi.fn(),
  logMemoryPromptBeforeAgentStart: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  errorDetails: vi.fn(() => ({ message: 'boom' })),
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/bootstrap', () => ({
  checkBootstrapStatus: mocks.checkBootstrapStatus,
  IDENTITY_QUESTIONS: [],
  MEMORY_QUESTIONS: [],
  USER_QUESTIONS: [],
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/memory-manager', () => ({
  resolveMemoryRoot: () => '/tmp/memory-root',
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/memory-config', () => ({
  getAutoRetrieveModeSync: mocks.getAutoRetrieveModeSync,
  getMemorySnapshotModeSync: mocks.getMemorySnapshotModeSync,
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/priority-context', () => ({
  buildPriorityContextSplit: mocks.buildPriorityContextSplit,
  clearPriorityContextCache: mocks.clearPriorityContextCache,
  buildPriorityContext: vi.fn(),
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/qmd', () => ({
  isQmdAvailable: mocks.isQmdAvailable,
  runQmdUpdateNow: mocks.runQmdUpdateNow,
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/logger', () => ({
  info: mocks.info,
  error: mocks.error,
  errorDetails: mocks.errorDetails,
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/migration', () => ({
  runPhase1Migration: mocks.runPhase1Migration,
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/memory-scoring', () => ({
  flushPendingStats: mocks.flushPendingStats,
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/memory-instructions', () => ({
  getMemoryInstructions: mocks.getMemoryInstructions,
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/prompt-debug', () => ({
  clearMemoryPromptDebugState: vi.fn(),
  logMemoryPromptAgentStart: mocks.logMemoryPromptAgentStart,
  logMemoryPromptBeforeAgentStart: mocks.logMemoryPromptBeforeAgentStart,
}));

import {
  registerContextInjection,
  resetBootstrapCache,
} from '../../../../../plugins/sero-memory-plugin/extension/context-injector';

function createFakePi() {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown> | unknown>>();
  return {
    handlers,
    sendMessage: vi.fn(),
    on(event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown> | unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
}

function getHandler(
  pi: ReturnType<typeof createFakePi>,
  event: string,
): (event: unknown, ctx: unknown) => Promise<unknown> | unknown {
  const handler = pi.handlers.get(event)?.[0];
  if (!handler) {
    throw new Error(`Missing handler for ${event}`);
  }
  return handler;
}

describe('context injector auto-retrieve gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBootstrapCache();
    mocks.getMemorySnapshotModeSync.mockReturnValue('live');
    mocks.getMemoryInstructions.mockReturnValue('\n\n## Memory System');
    mocks.buildPriorityContextSplit.mockImplementation(async (
      _root: string,
      _prompt: string,
      _sessionId: string,
      _snapshotMode: string,
      options?: { includeSearch?: boolean },
    ) => ({
      staticContext: '\n\n## Memory\n\nSTATIC',
      searchContext: options?.includeSearch === false ? '' : 'SEARCH RESULT',
    }));
  });

  it('passes includeSearch=false when auto-retrieve is off', async () => {
    mocks.getAutoRetrieveModeSync.mockReturnValue('off');

    const pi = createFakePi();
    registerContextInjection(pi as any);

    const beforeAgentStart = getHandler(pi, 'before_agent_start');
    const result = await beforeAgentStart(
      { prompt: 'What did we decide before?', systemPrompt: 'BASE' },
      {
        sessionManager: { getSessionId: () => 'session-off' },
        getSystemPrompt: () => 'BASE',
      },
    );

    expect(mocks.buildPriorityContextSplit).toHaveBeenCalledWith(
      '/tmp/memory-root',
      'What did we decide before?',
      'session-off',
      'live',
      { includeSearch: false },
    );
    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      systemPrompt: 'BASE\n\n## Memory\n\nSTATIC\n\n## Memory System',
    });
  });

  it('passes includeSearch=true and sends per-turn search context when auto-retrieve is on', async () => {
    mocks.getAutoRetrieveModeSync.mockReturnValue('on');

    const pi = createFakePi();
    registerContextInjection(pi as any);

    const beforeAgentStart = getHandler(pi, 'before_agent_start');
    await beforeAgentStart(
      { prompt: 'What did we decide before?', systemPrompt: 'BASE' },
      {
        sessionManager: { getSessionId: () => 'session-on' },
        getSystemPrompt: () => 'BASE',
      },
    );

    expect(mocks.buildPriorityContextSplit).toHaveBeenCalledWith(
      '/tmp/memory-root',
      'What did we decide before?',
      'session-on',
      'live',
      { includeSearch: true },
    );
    expect(pi.sendMessage).toHaveBeenCalledWith(
      { customType: 'memory-search-context', content: 'SEARCH RESULT', display: false },
      { triggerTurn: false },
    );
  });
});
