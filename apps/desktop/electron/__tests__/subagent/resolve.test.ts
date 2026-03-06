import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../../subagent/resolve';

describe('resolveConfig', () => {
  it('per-task override wins over all others', () => {
    const result = resolveConfig(
      { model: 'task-model', thinking: 'low', timeoutMs: 1000 },
      { model: 'call-model', thinking: 'high', timeoutMs: 2000 },
      { model: 'agent-model', thinking: 'medium', timeoutMs: 3000 },
      { model: 'settings-model', thinking: 'off', timeoutMs: 4000 },
      { model: 'session-model', thinking: 'high' },
    );

    expect(result.model).toBe('task-model');
    expect(result.thinking).toBe('low');
    expect(result.timeoutMs).toBe(1000);
  });

  it('call override wins over agent frontmatter', () => {
    const result = resolveConfig(
      undefined,
      { model: 'call-model', thinking: 'high', timeoutMs: 2000 },
      { model: 'agent-model', thinking: 'medium', timeoutMs: 3000 },
      { model: 'settings-model', thinking: 'off', timeoutMs: 4000 },
    );

    expect(result.model).toBe('call-model');
    expect(result.thinking).toBe('high');
    expect(result.timeoutMs).toBe(2000);
  });

  it('agent frontmatter wins over global settings', () => {
    const result = resolveConfig(
      undefined,
      undefined,
      { model: 'agent-model', thinking: 'medium', timeoutMs: 3000 },
      { model: 'settings-model', thinking: 'off', timeoutMs: 4000 },
    );

    expect(result.model).toBe('agent-model');
    expect(result.thinking).toBe('medium');
    expect(result.timeoutMs).toBe(3000);
  });

  it('global settings win over session defaults', () => {
    const result = resolveConfig(
      undefined,
      undefined,
      undefined,
      { model: 'settings-model', thinking: 'off', timeoutMs: 4000 },
      { model: 'session-model', thinking: 'high' },
    );

    expect(result.model).toBe('settings-model');
    expect(result.thinking).toBe('off');
    expect(result.timeoutMs).toBe(4000);
  });

  it('missing levels are skipped cleanly', () => {
    const result = resolveConfig(
      undefined,
      { model: undefined, thinking: 'xhigh' },
      { model: 'agent-model' },
      undefined,
      { model: 'session-model' },
    );

    expect(result.model).toBe('agent-model'); // Skips undefined call override
    expect(result.thinking).toBe('xhigh'); // From call override
  });

  it('all-null resolves to hardcoded defaults', () => {
    const result = resolveConfig(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.thinking).toBe('high');
    expect(result.timeoutMs).toBe(600_000);
  });

  it('null values in settings are skipped', () => {
    const result = resolveConfig(
      undefined,
      undefined,
      undefined,
      { model: null, thinking: null, timeoutMs: 300_000 },
      { model: 'session-model' },
    );

    expect(result.model).toBe('session-model'); // Skips null settings model
    expect(result.timeoutMs).toBe(300_000);
  });
});
