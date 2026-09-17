/**
 * Trace queries (spec architect-run-observability).
 *
 * Three properties are load-bearing: a foreign project reads nothing, a record's
 * non-metadata fields never leave the runtime, and a summary does not read a
 * trace to produce a total.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createRunJournal, type JournalRecord } from '../run-journal';
import { MAX_TRACE_PAGE, queryTrace, toTraceRecordView, type TraceQueryDeps } from '../trace-query';
import { cleanupHosts, fakeHost } from './helpers';

afterEach(cleanupHosts);

async function journalFor(projectId = 'proj_1') {
  const host = await fakeHost();
  const journal = createRunJournal({ homeDir: await host.homeDir() });
  const deps: TraceQueryDeps = { journal, authorize: async (id) => id === projectId };
  return { journal, deps };
}

describe('authorization', () => {
  it('returns nothing for a project the caller does not own', async () => {
    const { deps } = await journalFor();
    expect(await queryTrace(deps, { projectId: 'proj_other' })).toBeNull();
  });

  it('reads only after the project is authorized', async () => {
    const { deps } = await journalFor();
    const reads: string[] = [];
    const guarded: TraceQueryDeps = {
      authorize: deps.authorize,
      journal: { ...deps.journal, readSummary: async (projectId, journalId) => { reads.push(projectId); return deps.journal.readSummary(projectId, journalId); } },
    };
    await queryTrace(guarded, { projectId: 'proj_other' });
    expect(reads).toEqual([]);
  });
});

describe('what a record exposes', () => {
  it('copies named metadata and drops everything else', () => {
    const view = toTraceRecordView({
      v: 1, seq: 4, at: '2026-09-14T09:00:00.000Z', kind: 'observation',
      source: 'workflow', operationId: 'op_1', operationKind: 'workflow', recordKind: 'operation-start',
      model: 'openai-codex/gpt-5.6-terra', thinking: 'high',
      // None of these travel.
      prompt: 'the full owner prompt, which may contain the brief and user text',
      rawPayload: { tool: 'bash', command: 'cat ~/.ssh/id_rsa' },
      reasoning: 'chain of thought',
      apiKey: 'sk-secret',
    });

    expect(view).toMatchObject({ seq: 4, source: 'workflow', operationId: 'op_1', model: 'openai-codex/gpt-5.6-terra' });
    const serialized = JSON.stringify(view);
    for (const secret of ['prompt', 'rawPayload', 'reasoning', 'apiKey', 'ssh', 'sk-secret', 'chain of thought']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('keeps a name list but refuses a nested payload', () => {
    const view = toTraceRecordView({
      v: 1, seq: 1, at: 't', kind: 'observation',
      linkedOperationIds: ['op_a', 'op_b'],
      parentOperationId: { nested: 'object' },
    });
    expect(view.linkedOperationIds).toEqual(['op_a', 'op_b']);
    expect(view.parentOperationId).toBeUndefined();
  });

  it('keeps token counters and nothing else from usage', () => {
    const view = toTraceRecordView({
      v: 1, seq: 2, at: 't', kind: 'usage',
      usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, note: 'not a number' },
    });
    expect(view.usage).toEqual({ inputTokens: 10, outputTokens: 4, cacheReadTokens: 2 });
  });
});

describe('summary and detail', () => {
  it('says nothing was recorded, and does not reconcile spend, when no journal exists', async () => {
    const { deps } = await journalFor();
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: 'run-initial-proj_1', knownSpendUsd: 22.37 });
    expect(answer?.recorded).toBe(false);
    expect(answer?.summary.reconciliationUsd).toBeUndefined();
  });

  it('is recorded once a single record exists, and then reconciles', async () => {
    const { journal, deps } = await journalFor();
    await journal.append('proj_1', 'prod', { kind: 'usage', at: 't', source: 'dispatch:workflow:loop_1', costUsd: 0.4, coverage: 'aggregate' });
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: 'prod', knownSpendUsd: 0.4 });
    expect(answer?.recorded).toBe(true);
    expect(answer?.summary.reconciliationUsd).toBeCloseTo(0);
  });

  it('answers a summary without sending any record detail', async () => {
    const { journal, deps } = await journalFor();
    await journal.append('proj_1', 'prod', { kind: 'usage', at: 't', source: 'dispatch:workflow:loop_1', costUsd: 0.4, coverage: 'aggregate' });
    let read = 0;
    const counting: TraceQueryDeps = {
      authorize: deps.authorize,
      journal: { ...journal, readPage: async (...args) => { const page = await journal.readPage(...args); read += page.records.length; return page; } },
    };

    const answer = await queryTrace(counting, { projectId: 'proj_1', journalId: 'prod' });
    expect(answer?.summary.attributableUsd).toBeCloseTo(0.4);
    // The project was authorized and the answer carries no record, so a page
    // showing a summary cannot show a trace.
    expect(await deps.authorize('proj_1')).toBe(true);
    expect(answer?.records).toBeUndefined();
    expect(answer?.nextAfterSeq).toBeUndefined();
    // It folded what exists, and it never reads more than its bound.
    expect(read).toBeLessThanOrEqual(1000);
  });

  it('returns the page when detail is asked for, and bounds it', async () => {
    const { journal, deps } = await journalFor();
    for (let index = 0; index < 5; index += 1) {
      await journal.append('proj_1', 'prod', { kind: 'usage', at: 't', source: `s${index}`, costUsd: 0.1, coverage: 'call' });
    }

    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: 'prod', detail: true, limit: 2 });
    expect(answer?.records).toHaveLength(2);
    expect(answer?.nextAfterSeq).toBe(2);
    expect(answer?.summary.attributableUsd).toBeCloseTo(0.5);

    // A caller cannot lift the bound by asking for more.
    const greedy = await queryTrace(deps, { projectId: 'proj_1', journalId: 'prod', detail: true, limit: 100_000 });
    expect(greedy?.records?.length).toBeLessThanOrEqual(MAX_TRACE_PAGE);
  });

  it('says a total is incomplete when there is more history than it folded', async () => {
    const { journal } = await journalFor();
    await journal.append('proj_1', 'prod', { kind: 'usage', at: 't', source: 's1', costUsd: 0.1, coverage: 'call' });
    const capped: TraceQueryDeps = {
      authorize: async () => true,
      journal: { ...journal, readSummary: async () => null, readPage: async (_p, _j, options) => ({ records: [{ v: 1, seq: 1, at: 't', kind: 'usage', costUsd: 0.1 }], nextAfterSeq: 1, incomplete: options?.limit === 1 }) },
    };
    const answer = await queryTrace(capped, { projectId: 'proj_1', journalId: 'prod' });
    expect(answer?.summary.incomplete).toBe(true);
  });

  it('claims no open wait when the fold was cut short, because its end may lie past the bound', async () => {
    const { journal } = await journalFor();
    const started: JournalRecord = { v: 1, seq: 1, at: 't', kind: 'observation', recordKind: 'operation-start', operationId: 'w', operationKind: 'wait', waitCause: 'approval' };
    const capped: TraceQueryDeps = {
      authorize: async () => true,
      journal: { ...journal, readSummary: async () => null, readPage: async () => ({ records: [started], nextAfterSeq: 1, incomplete: true }) },
    };
    const answer = await queryTrace(capped, { projectId: 'proj_1', journalId: 'prod' });
    expect(answer?.timing.openWaits).toEqual([]);
    // The same start in a complete fold is an open wait.
    const whole: TraceQueryDeps = {
      authorize: async () => true,
      journal: { ...journal, readSummary: async () => null, readPage: async () => ({ records: [started], nextAfterSeq: null, incomplete: false }) },
    };
    expect((await queryTrace(whole, { projectId: 'proj_1', journalId: 'prod' }))?.timing.openWaits).toEqual(['approval']);
  });
});
