import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Type } from '@sinclair/typebox';

import { bridgeTool, getBridgedToolTimeoutMs } from '../../cli/core/schema-bridge';
import {
  buildBatchDeadline,
  DEFAULT_PER_COMMAND_TIMEOUT_MS,
  resolveCommandTimeoutMs,
} from '../../cli/core/timeouts';

describe('CLI bridged command timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns a longer timeout to fetch_content when bridged through sero-cli', () => {
    const bridged = bridgeTool('fetch_content', {
      name: 'fetch_content',
      label: 'Fetch Content',
      description: 'Fetch URL content',
      parameters: Type.Object({ url: Type.String() }),
      execute: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        details: null,
      }),
    });

    expect(bridged.timeoutMs).toBe(300_000);
    expect(getBridgedToolTimeoutMs('fetch_content')).toBe(300_000);
  });

  it('does not apply the implicit batch deadline to single tool commands', () => {
    const deadline = buildBatchDeadline('tool', undefined, true);

    expect(deadline).toBeNull();
    expect(resolveCommandTimeoutMs(deadline, getBridgedToolTimeoutMs('fetch_content'))).toBe(300_000);
  });

  it('still caps multi-command batches with the shared default deadline', () => {
    const deadline = buildBatchDeadline('tool', undefined, false);

    expect(deadline).toBe(Date.now() + 120_000);
    expect(resolveCommandTimeoutMs(deadline, getBridgedToolTimeoutMs('fetch_content'))).toBe(120_000);
  });

  it('keeps the standard timeout for normal bridged commands', () => {
    const deadline = buildBatchDeadline('tool', undefined, true);

    expect(resolveCommandTimeoutMs(deadline, getBridgedToolTimeoutMs('notes'))).toBe(DEFAULT_PER_COMMAND_TIMEOUT_MS);
  });
});
