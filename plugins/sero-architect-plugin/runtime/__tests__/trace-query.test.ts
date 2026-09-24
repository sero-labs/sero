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
import type { ProjectRecord } from '../../shared/record';
import { buildingProject, cleanupHosts, fakeHost, milestone } from './helpers';

afterEach(cleanupHosts);

async function journalFor(project: ProjectRecord = buildingProject()) {
  const host = await fakeHost();
  const journal = createRunJournal({ homeDir: await host.homeDir() });
  const deps: TraceQueryDeps = { journal, readProject: async (id) => (id === project.id ? project : null) };
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
      readProject: deps.readProject,
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
      readProject: deps.readProject,
      journal: { ...journal, readPage: async (...args) => { const page = await journal.readPage(...args); read += page.records.length; return page; } },
    };

    const answer = await queryTrace(counting, { projectId: 'proj_1', journalId: 'prod' });
    expect(answer?.summary.attributableUsd).toBeCloseTo(0.4);
    // The project was authorized and the answer carries no record, so a page
    // showing a summary cannot show a trace.
    expect(await deps.readProject('proj_1')).not.toBeNull();
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
      readProject: async () => buildingProject(),
      journal: { ...journal, readSummary: async () => null, readPage: async (_p, _j, options) => ({ records: [{ v: 1, seq: 1, at: 't', kind: 'usage', costUsd: 0.1 }], nextAfterSeq: 1, incomplete: options?.limit === 1 }) },
    };
    const answer = await queryTrace(capped, { projectId: 'proj_1', journalId: 'prod' });
    expect(answer?.summary.incomplete).toBe(true);
  });

  it('claims no open wait when the fold was cut short, because its end may lie past the bound', async () => {
    const { journal } = await journalFor();
    const started: JournalRecord = { v: 1, seq: 1, at: 't', kind: 'observation', recordKind: 'operation-start', operationId: 'w', operationKind: 'wait', waitCause: 'approval' };
    const capped: TraceQueryDeps = {
      readProject: async () => buildingProject(),
      journal: { ...journal, readSummary: async () => null, readPage: async () => ({ records: [started], nextAfterSeq: 1, incomplete: true }) },
    };
    const answer = await queryTrace(capped, { projectId: 'proj_1', journalId: 'prod' });
    expect(answer?.timing.openWaits).toEqual([]);
    // The same start in a complete fold is an open wait.
    const whole: TraceQueryDeps = {
      readProject: async () => buildingProject(),
      journal: { ...journal, readSummary: async () => null, readPage: async () => ({ records: [started], nextAfterSeq: null, incomplete: false }) },
    };
    expect((await queryTrace(whole, { projectId: 'proj_1', journalId: 'prod' }))?.timing.openWaits).toEqual(['approval']);
  });
});

describe('the named activity tree', () => {
  const RUN = 'run-1';
  function namedProject(): ProjectRecord {
    return buildingProject({
      runs: [{ id: RUN, kind: 'initial', objectiveId: null, startedAt: 't0', endedAt: null, outcome: 'in-progress' }],
      milestones: [
        milestone('m1', { title: 'M1 · Playable crossing', status: 'done', dispatch: { kind: 'workflow', id: 'loop_a', workspaceId: 'ws-1', dispatchedAt: 't0', chargedUsd: 0, destination: null } }),
        milestone('m2', { title: 'M2 · Hardening' }),
      ],
      research: [{ id: 'res_1', roomId: 'room_1', question: 'What should the first minute teach?', stoppingCondition: 'enough', result: 'r', costUsd: 0, completedAt: 't0' }],
      blockedOn: { kind: 'room', id: 'room_9', title: 'Design review Room', status: 'cancelled', at: 't0' },
    } as Partial<ProjectRecord>);
  }
  const at = (index: number) => `2026-09-16T10:${String(index).padStart(2, '0')}:00.000Z`;

  it('returns the charge detail a caller recorded in the record view', async () => {
    const { journal, deps } = await journalFor(namedProject());
    await journal.append('proj_1', RUN, {
      kind: 'usage', at: at(1), source: 'owner:sess-1', costUsd: 0.02, coverage: 'call',
      parentOperationId: `${RUN}:owner-wake:w1`, model: 'anthropic/claude-fable-5-1', thinking: 'medium',
      usage: { inputTokens: 150, outputTokens: 20, cacheReadTokens: 40, cacheWriteTokens: 5 },
    });
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: RUN, detail: true });
    expect(answer?.records?.[0]).toMatchObject({
      parentOperationId: `${RUN}:owner-wake:w1`, model: 'anthropic/claude-fable-5-1', thinking: 'medium',
      usage: { inputTokens: 150, outputTokens: 20, cacheReadTokens: 40, cacheWriteTokens: 5 },
      nodeId: `${RUN}:owner-wake:w1`, label: 'Owner wake',
    });
  });

  it('names research, milestones and Rooms from the record, and falls back to the id', async () => {
    const { journal, deps } = await journalFor(namedProject());
    for (const [index, source] of ['room-planning:research:res_1', 'room:room_1', 'dispatch:workflow:loop_a', 'room:room_9', 'dispatch:workflow:loop_gone'].entries()) {
      await journal.append('proj_1', RUN, { kind: 'usage', at: at(index), source, costUsd: 0.1, coverage: 'aggregate' });
    }
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: RUN, detail: true });
    expect(answer?.records?.map((record) => record.label)).toEqual([
      'What should the first minute teach?',
      'What should the first minute teach?',
      'M1 · Playable crossing',
      'Design review Room',
      'loop_gone',
    ]);
    // A Room charge whose Room ran the research sits under that research.
    const research = answer?.activity.nodes.find((node) => node.id === `${RUN}:research:res_1`);
    expect(research).toMatchObject({ group: 'research', charges: 2, state: 'done' });
    expect(research?.costUsd).toBeCloseTo(0.2);
    expect(answer?.activity.nodes.find((node) => node.label === 'loop_gone')?.rawId).toBe('loop_gone');
  });

  it('places a research charge under its research operation', async () => {
    const { journal, deps } = await journalFor(namedProject());
    await journal.append('proj_1', RUN, { kind: 'observation', at: at(0), operationId: `${RUN}:research:res_1`, operationKind: 'research', recordKind: 'operation-start' });
    await journal.append('proj_1', RUN, { kind: 'usage', at: at(1), source: 'research:usage_1', costUsd: 0.3, coverage: 'call', parentOperationId: `${RUN}:research:res_1` });
    await journal.append('proj_1', RUN, { kind: 'observation', at: at(2), operationId: `${RUN}:research:res_1`, recordKind: 'operation-end', outcome: 'ok' });
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: RUN, detail: true });
    const node = answer?.activity.nodes.find((entry) => entry.id === `${RUN}:research:res_1`);
    expect(node).toMatchObject({ label: 'What should the first minute teach?', synthetic: false, state: 'done', charges: 1 });
    expect(answer?.records?.find((record) => record.kind === 'usage')?.nodeId).toBe(`${RUN}:research:res_1`);
  });

  it('nests a milestone\'s own operations under its title and counts a restart as a retry', async () => {
    const { journal, deps } = await journalFor(namedProject());
    for (let round = 0; round < 2; round += 1) {
      await journal.append('proj_1', RUN, { kind: 'observation', at: at(round * 2), operationId: `${RUN}:evidence:m1`, operationKind: 'evidence', recordKind: 'operation-start' });
      await journal.append('proj_1', RUN, { kind: 'observation', at: at(round * 2 + 1), operationId: `${RUN}:evidence:m1`, recordKind: 'operation-end', outcome: round === 0 ? 'failed' : 'ok' });
    }
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: RUN });
    const evidence = answer?.activity.nodes.filter((node) => node.id === `${RUN}:evidence:m1`);
    expect(evidence).toHaveLength(1);
    expect(evidence?.[0]).toMatchObject({ parentId: `${RUN}:milestone:m1`, label: 'Evidence', retries: 1, state: 'done', group: 'evaluation' });
    expect(answer?.activity.nodes.find((node) => node.id === `${RUN}:milestone:m1`)?.label).toBe('M1 · Playable crossing');
  });

  it('names an owner wake by why it ran, and an older wake without a reason plainly', async () => {
    const { journal, deps } = await journalFor(namedProject());
    await journal.append('proj_1', RUN, { kind: 'observation', at: at(0), operationId: `${RUN}:owner-wake:dispatch-complete:wake_1`, operationKind: 'owner-wake', recordKind: 'operation-start' });
    await journal.append('proj_1', RUN, { kind: 'observation', at: at(1), operationId: `${RUN}:owner-wake:wake_old`, operationKind: 'owner-wake', recordKind: 'operation-start' });
    const labels = (await queryTrace(deps, { projectId: 'proj_1', journalId: RUN }))?.activity.nodes.map((node) => node.label);
    expect(labels).toEqual(['Owner wake · work finished', 'Owner wake']);
  });

  it('folds 100 legacy owner charges into one Owner row whose cost is their sum', async () => {
    const { journal, deps } = await journalFor(namedProject());
    for (let index = 0; index < 100; index += 1) {
      await journal.append('proj_1', RUN, { kind: 'usage', at: at(index % 60), source: 'owner:01a0ac5a-f8ec', costUsd: 0.01, coverage: 'aggregate' });
    }
    const answer = await queryTrace(deps, { projectId: 'proj_1', journalId: RUN, detail: true, limit: 200 });
    const owners = answer?.activity.nodes.filter((node) => node.group === 'owner');
    expect(owners).toHaveLength(1);
    expect(owners?.[0]).toMatchObject({ label: 'Owner', parentId: null, charges: 100, coverage: 'aggregate', tokens: null });
    expect(owners?.[0]?.costUsd).toBeCloseTo(1);
    expect(new Set(answer?.records?.map((record) => record.nodeId))).toEqual(new Set([owners?.[0]?.id]));
  });
});
