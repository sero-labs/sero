/**
 * Run observation contracts (spec architect-run-observability).
 *
 * The contract is metadata only by construction, and it keeps the SDK's own
 * categories instead of inventing values a provider never reported. These tests
 * pin the two properties the runtime depends on: distinct identities for
 * parallel work, and explicit unknowns rather than zeros.
 */

import { describe, expect, it } from 'vitest';
import {
  SDK_OBSERVATION_GAPS,
  isMetadataOnly,
  toObservationUsage,
  type ObservationRecord,
} from '@sero-ai/common';

describe('observation usage keeps the SDK categories apart', () => {
  it('carries input, output, cache and cost as reported', () => {
    const usage = toObservationUsage({
      input: 1_840, output: 320, cacheRead: 12_100, cacheWrite: 2_600, cacheWrite1h: 900, reasoning: 210,
      cost: { total: 0.041 },
    });
    expect(usage).toEqual({
      inputTokens: 1_840,
      outputTokens: 320,
      reasoningTokens: 210,
      cacheReadTokens: 12_100,
      cacheWriteTokens: 2_600,
      cacheWrite1hTokens: 900,
      costUsd: 0.041,
    });
    // Nothing was missing, so the record does not claim to be incomplete.
    expect(usage?.incomplete).toBeUndefined();
    expect(usage?.unavailable).toBeUndefined();
  });

  it('names a counter the provider omitted instead of reporting zero', () => {
    const usage = toObservationUsage({ input: 10, output: 2, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } });
    expect(usage?.reasoningTokens).toBeUndefined();
    expect(usage?.cacheWrite1hTokens).toBeUndefined();
    expect(usage?.unavailable).toEqual(['reasoningTokens', 'cacheWrite1hTokens']);
    expect(usage?.incomplete).toBe(true);
    // A measured zero is still a zero: it is not listed as unavailable.
    expect(usage?.cacheReadTokens).toBe(0);
  });

  it('marks an unpriced model incomplete rather than free', () => {
    const usage = toObservationUsage({ input: 10, output: 2, cacheRead: 0, cacheWrite: 0, reasoning: 0 });
    expect(usage?.costUsd).toBeUndefined();
    expect(usage?.unavailable).toContain('costUsd');
    expect(usage?.incomplete).toBe(true);
  });

  it('reports nothing when there was no usage snapshot at all', () => {
    expect(toObservationUsage(undefined)).toBeUndefined();
  });
});

describe('the contract is metadata only', () => {
  const base: ObservationRecord = {
    kind: 'tool-end',
    identities: { operationId: 'op-1', toolCallId: 'call-7', attemptId: 'attempt-2', turnId: 'turn-1' },
    startedAt: '2026-09-14T09:20:00.000Z',
    endedAt: '2026-09-14T09:20:03.400Z',
    outcome: 'ok',
  };

  it('accepts a record built only from allowed fields', () => {
    expect(isMetadataOnly(base)).toBe(true);
    expect(isMetadataOnly({ ...base, usage: toObservationUsage({ input: 1 })! })).toBe(true);
  });

  it('rejects a record that carries a payload or reasoning text', () => {
    expect(isMetadataOnly({ ...base, args: { path: '/etc/passwd' } } as unknown as ObservationRecord)).toBe(false);
    expect(isMetadataOnly({ ...base, reasoning: 'the model thought about it' } as unknown as ObservationRecord)).toBe(false);
    expect(isMetadataOnly({ ...base, result: 'raw tool output' } as unknown as ObservationRecord)).toBe(false);
  });

  it('rejects an identity field the contract does not define', () => {
    const widened = { ...base, identities: { ...base.identities, sessionPath: '/home/dan/session.jsonl' } };
    expect(isMetadataOnly(widened as ObservationRecord)).toBe(false);
  });

  it('rejects a usage field the contract does not define', () => {
    const widened = { ...base, usage: { inputTokens: 1, rawPayload: 'x' } };
    expect(isMetadataOnly(widened as unknown as ObservationRecord)).toBe(false);
  });
});

describe('the SDK cannot measure everything, and the contract says so', () => {
  it('records the missing first-token event rather than deriving timing from deltas', () => {
    expect(SDK_OBSERVATION_GAPS).toContain('no-first-token-event');
  });
});
