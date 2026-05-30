import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const mocks = vi.hoisted(() => ({
  checkBootstrapStatus: vi.fn(),
  buildPriorityContextSplit: vi.fn(),
  runPhase1Migration: vi.fn(),
  runQmdUpdateNow: vi.fn(),
  flushPendingStats: vi.fn(),
  clearPriorityContextCache: vi.fn(),
  clearMemoryPromptDebugState: vi.fn(),
  logMemoryPromptAgentStart: vi.fn(),
  logMemoryPromptBeforeAgentStart: vi.fn(),
  sendMessage: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../bootstrap', () => ({
  checkBootstrapStatus: mocks.checkBootstrapStatus,
  IDENTITY_QUESTIONS: [],
  MEMORY_QUESTIONS: [],
  USER_QUESTIONS: [],
}));

vi.mock('../memory-manager', () => ({
  resolveMemoryRoot: () => '/tmp/sero-memory-root',
}));

vi.mock('../memory-config', () => ({
  getAutoRetrieveModeSync: () => 'off',
  getMemorySnapshotModeSync: () => 'live',
}));

vi.mock('../priority-context', () => ({
  buildPriorityContextSplit: mocks.buildPriorityContextSplit,
  buildPriorityContext: vi.fn(),
  clearPriorityContextCache: mocks.clearPriorityContextCache,
}));

vi.mock('../qmd', () => ({
  isQmdAvailable: () => true,
  runQmdUpdateNow: mocks.runQmdUpdateNow,
}));

vi.mock('../logger', () => ({
  info: mocks.info,
  error: mocks.error,
  errorDetails: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}));

vi.mock('../migration', () => ({
  runPhase1Migration: mocks.runPhase1Migration,
}));

vi.mock('../memory-scoring', () => ({
  flushPendingStats: mocks.flushPendingStats,
}));

vi.mock('../memory-instructions', () => ({
  getMemoryInstructions: () => '\nMemory instructions',
}));

vi.mock('../prompt-debug', () => ({
  clearMemoryPromptDebugState: mocks.clearMemoryPromptDebugState,
  logMemoryPromptAgentStart: mocks.logMemoryPromptAgentStart,
  logMemoryPromptBeforeAgentStart: mocks.logMemoryPromptBeforeAgentStart,
}));

import {
  registerContextInjection,
  resetBootstrapCache,
} from '../context-injector';
import {
  clearPhase1MigrationState,
  getPhase1MigrationState,
  setPhase1MigrationState,
} from '../phase1-migration-state';

type RegisteredHandler = (event: unknown, ctx?: unknown) => unknown;

function createPiHarness(): {
  handlers: Map<string, RegisteredHandler>;
  api: ExtensionAPI;
} {
  const handlers = new Map<string, RegisteredHandler>();
  const api = {
    on: (event: string, handler: RegisteredHandler) => {
      handlers.set(event, handler);
    },
    sendMessage: mocks.sendMessage,
  } as Pick<ExtensionAPI, 'on' | 'sendMessage'> as ExtensionAPI;
  return { handlers, api };
}

function createBeforeAgentStartContext(sessionId: string) {
  return {
    sessionManager: {
      getSessionId: () => sessionId,
    },
  };
}

describe('context injector phase-1 migration state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBootstrapCache();
    clearPhase1MigrationState('session-entered');
    clearPhase1MigrationState('session-fallback');
    mocks.checkBootstrapStatus.mockResolvedValue({
      needsBootstrap: false,
      existingUserContent: null,
    });
    mocks.buildPriorityContextSplit.mockResolvedValue({
      staticContext: 'Static memory context',
      searchContext: '',
    });
    mocks.runPhase1Migration.mockResolvedValue({ changed: false, notes: [] });
  });

  it('does not rerun phase-1 migration on first turn after session enter already checked it', async () => {
    const { api, handlers } = createPiHarness();
    registerContextInjection(api);
    setPhase1MigrationState('session-entered', false);

    const beforeAgentStart = handlers.get('before_agent_start');
    expect(beforeAgentStart).toBeDefined();

    const result = await beforeAgentStart!(
      { prompt: 'hello', systemPrompt: 'base' },
      createBeforeAgentStartContext('session-entered'),
    );

    expect(mocks.runPhase1Migration).not.toHaveBeenCalled();
    expect(result).toEqual({ systemPrompt: 'baseStatic memory context\nMemory instructions' });
  });

  it('runs the fallback phase-1 migration once, then reuses the recorded state', async () => {
    const { api, handlers } = createPiHarness();
    registerContextInjection(api);

    const beforeAgentStart = handlers.get('before_agent_start');
    expect(beforeAgentStart).toBeDefined();

    const firstResult = await beforeAgentStart!(
      { prompt: 'first turn', systemPrompt: 'base' },
      createBeforeAgentStartContext('session-fallback'),
    );
    const secondResult = await beforeAgentStart!(
      { prompt: 'second turn', systemPrompt: 'base' },
      createBeforeAgentStartContext('session-fallback'),
    );

    expect(mocks.runPhase1Migration).toHaveBeenCalledTimes(1);
    expect(mocks.runQmdUpdateNow).not.toHaveBeenCalled();
    expect(getPhase1MigrationState('session-fallback')).toEqual({
      checked: true,
      changed: false,
    });
    expect(firstResult).toEqual({ systemPrompt: 'baseStatic memory context\nMemory instructions' });
    expect(secondResult).toEqual({ systemPrompt: 'baseStatic memory context\nMemory instructions' });
  });
});
