import { describe, expect, it, vi } from 'vitest';

import { extractAgentContext } from '@electron/cli/core/tool';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createMockExtensionContext(
  overrides?: Partial<ExtensionContext>,
): ExtensionContext {
  return {
    cwd: '/workspace',
    model: { id: 'claude-sonnet', api: 'anthropic-messages', provider: 'anthropic' } as ExtensionContext['model'],
    modelRegistry: { getApiKeyAndHeaders: vi.fn() } as unknown as ExtensionContext['modelRegistry'],
    sessionManager: { getSessionId: vi.fn(() => 'sid-1') } as unknown as ExtensionContext['sessionManager'],
    mode: 'rpc',
    hasUI: true,
    ui: { notify: vi.fn() } as unknown as ExtensionContext['ui'],
    isIdle: vi.fn(() => true),
    isProjectTrusted: vi.fn(() => false),
    signal: undefined,
    abort: vi.fn(),
    hasPendingMessages: vi.fn(() => false),
    shutdown: vi.fn(),
    getContextUsage: vi.fn(() => undefined),
    compact: vi.fn(),
    getSystemPrompt: vi.fn(() => 'system prompt'),
    ...overrides,
    scopedModels: overrides?.scopedModels ?? [],
  };
}

describe('extractAgentContext', () => {
  it('excludes cwd from the result', () => {
    const ctx = createMockExtensionContext();
    const result = extractAgentContext(ctx);

    expect(result).not.toHaveProperty('cwd');
  });

  it('preserves model and modelRegistry references', () => {
    const ctx = createMockExtensionContext();
    const result = extractAgentContext(ctx);

    expect(result.model).toBe(ctx.model);
    expect(result.modelRegistry).toBe(ctx.modelRegistry);
  });

  it('preserves sessionManager reference', () => {
    const ctx = createMockExtensionContext();
    const result = extractAgentContext(ctx);

    expect(result.sessionManager).toBe(ctx.sessionManager);
  });

  it('preserves hasUI and ui', () => {
    const ctx = createMockExtensionContext({ hasUI: false });
    const result = extractAgentContext(ctx);

    expect(result.hasUI).toBe(false);
    expect(result.ui).toBe(ctx.ui);
  });

  it('wraps method calls to preserve this-binding', () => {
    const ctx = createMockExtensionContext();
    const result = extractAgentContext(ctx);

    // Call through the wrapper — original mock should be invoked
    expect(result.isIdle()).toBe(true);
    expect(ctx.isIdle).toHaveBeenCalledOnce();

    result.abort();
    expect(ctx.abort).toHaveBeenCalledOnce();

    result.hasPendingMessages();
    expect(ctx.hasPendingMessages).toHaveBeenCalledOnce();

    result.getSystemPrompt();
    expect(ctx.getSystemPrompt).toHaveBeenCalledOnce();

    result.getContextUsage();
    expect(ctx.getContextUsage).toHaveBeenCalledOnce();
  });

  it('forwards compact options', () => {
    const ctx = createMockExtensionContext();
    const result = extractAgentContext(ctx);

    result.compact({ customInstructions: 'summarize' });
    expect(ctx.compact).toHaveBeenCalledWith({ customInstructions: 'summarize' });
  });

  it('handles undefined model gracefully', () => {
    const ctx = createMockExtensionContext({ model: undefined });
    const result = extractAgentContext(ctx);

    expect(result.model).toBeUndefined();
  });
});
