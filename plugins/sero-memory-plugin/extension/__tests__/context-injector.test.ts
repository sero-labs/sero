import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const mocks = vi.hoisted(() => ({
  checkBootstrapStatus: vi.fn(),
  buildPriorityContext: vi.fn(),
}));

vi.mock('../bootstrap', () => ({
  checkBootstrapStatus: mocks.checkBootstrapStatus,
  IDENTITY_QUESTIONS: [],
  USER_QUESTIONS: [],
}));

vi.mock('../memory-manager', () => ({
  getUserPath: () => '/tmp/sero-memory-root/USER.md',
  readFile: vi.fn(async () => null),
  resolveMemoryRoot: () => '/tmp/sero-memory-root',
}));

vi.mock('../priority-context', () => ({
  buildPriorityContext: mocks.buildPriorityContext,
  clearPriorityContextCache: vi.fn(),
}));

vi.mock('../memory-instructions', () => ({
  getMemoryInstructions: () => '\nMemory instructions',
}));

import { registerContextInjection, resetBootstrapCache } from '../context-injector';

type RegisteredHandler = (event: unknown, ctx?: unknown) => unknown;

function createPiHarness(): Map<string, RegisteredHandler> {
  const handlers = new Map<string, RegisteredHandler>();
  const api = {
    on: (event: string, handler: RegisteredHandler) => {
      handlers.set(event, handler);
    },
  } as Pick<ExtensionAPI, 'on'> as ExtensionAPI;
  registerContextInjection(api);
  return handlers;
}

const ctx = { sessionManager: { getSessionId: () => 'session-1' } };

describe('context injector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBootstrapCache();
    mocks.checkBootstrapStatus.mockResolvedValue({ needsBootstrap: false, existingUserContent: null });
    mocks.buildPriorityContext.mockResolvedValue('Static memory context');
  });

  it('adds the memory files and instructions to the system prompt', async () => {
    const handlers = createPiHarness();

    const result = await handlers.get('before_agent_start')!({ prompt: 'hello', systemPrompt: 'base' }, ctx);

    expect(result).toEqual({ systemPrompt: 'baseStatic memory context\nMemory instructions' });
  });

  it('adds caveman instructions when USER.md context enables caveman mode', async () => {
    mocks.buildPriorityContext.mockResolvedValue(
      '\n\n## Memory\n\n### USER.md\n\n# User\n\n- **Communication:** Caveman mode — compressed replies\n- **Caveman Mode:** full',
    );
    const handlers = createPiHarness();

    const result = await handlers.get('before_agent_start')!({ prompt: 'hello', systemPrompt: 'base' }, ctx);

    expect(result).toMatchObject({
      systemPrompt: expect.stringContaining('IMPORTANT: Respond in Caveman mode'),
    });
  });

  it('keeps memory messages stored by older versions out of the model context', async () => {
    const handlers = createPiHarness();
    const kept = { role: 'user', content: 'hello' };

    const result = await handlers.get('context')!({
      messages: [
        kept,
        { role: 'custom', customType: 'memory-search-context', content: 'old search hits' },
        { role: 'custom', customType: 'memory-context', content: 'old memory copy' },
      ],
    });

    expect(result).toEqual({ messages: [kept] });
  });

  it('switches from setup instructions to memory once setup finishes in a turn', async () => {
    mocks.checkBootstrapStatus.mockResolvedValueOnce({ needsBootstrap: true, existingUserContent: null });
    const handlers = createPiHarness();
    const beforeAgentStart = handlers.get('before_agent_start')!;

    const setupTurn = await beforeAgentStart({ prompt: 'hi', systemPrompt: 'base' }, ctx);
    await handlers.get('agent_end')!({});
    const nextTurn = await beforeAgentStart({ prompt: 'next', systemPrompt: 'base' }, ctx);

    expect(setupTurn).toMatchObject({ systemPrompt: expect.stringContaining('Memory Setup Required') });
    expect(nextTurn).toEqual({ systemPrompt: 'baseStatic memory context\nMemory instructions' });
  });
});
