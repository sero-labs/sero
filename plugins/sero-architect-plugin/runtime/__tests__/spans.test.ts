/**
 * Semantic operation spans (spec architect-run-observability).
 *
 * A deterministic fixture replaying one complete Architect objective: research,
 * planning with a repair, trigger inference, evaluations, worker retries,
 * command evidence, capture and delivery. The assertions are the ones the
 * inspector depends on: every activity appears exactly once, containment is
 * preserved, handoffs are linked, and an unfinished operation stays open.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ObservationOperationKind } from '@sero-ai/common';
import { createRunJournal, type JournalRecord } from '../run-journal';
import { createSpanRecorder } from '../spans';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const PROJECT = 'hollow-depths';
const RUN = 'run-initial';

interface FixtureSpan {
  id: string;
  kind: ObservationOperationKind;
  parent?: string;
  links?: string[];
  outcome?: 'ok' | 'failed';
  /** Present when this operation ended the run by still being open. */
  open?: boolean;
}

/** One objective, in the order the runtime performs it. */
const FIXTURE: FixtureSpan[] = [
  { id: 'owner-wake', kind: 'owner-wake' },

  { id: 'research', kind: 'research', parent: 'owner-wake' },
  { id: 'research:q1', kind: 'research', parent: 'research' },
  { id: 'research:q2', kind: 'research', parent: 'research' },

  { id: 'planning', kind: 'planning', parent: 'owner-wake' },
  // A validation failure, then the repair that fixes it.
  { id: 'planning:repair', kind: 'repair', parent: 'planning', outcome: 'failed' },
  { id: 'planning:repair:retry', kind: 'repair', parent: 'planning' },
  { id: 'trigger-inference', kind: 'trigger-extraction', parent: 'planning' },

  { id: 'room', kind: 'room', parent: 'owner-wake' },
  { id: 'room:member-renderer', kind: 'room-member', parent: 'room' },
  { id: 'room:member-tests', kind: 'room-member', parent: 'room' },
  { id: 'room:synthesis', kind: 'evaluation', parent: 'room', links: ['room:member-renderer', 'room:member-tests'] },

  { id: 'workflow', kind: 'workflow', parent: 'owner-wake' },
  { id: 'workflow:step-1', kind: 'workflow-step', parent: 'workflow' },
  { id: 'workflow:step-1:attempt-1', kind: 'workflow-attempt', parent: 'workflow:step-1', outcome: 'failed' },
  { id: 'workflow:step-1:attempt-2', kind: 'workflow-attempt', parent: 'workflow:step-1' },
  { id: 'workflow:step-2', kind: 'workflow-step', parent: 'workflow' },
  { id: 'workflow:step-2:evidence', kind: 'evidence', parent: 'workflow:step-2' },
  { id: 'workflow:step-2:capture', kind: 'evidence', parent: 'workflow:step-2' },

  { id: 'workflow:review', kind: 'evaluation', parent: 'workflow', links: ['workflow:step-2'] },
  { id: 'delivery', kind: 'delivery', parent: 'owner-wake' },
  // The objective is not finished: this operation is still running.
  { id: 'workflow:step-3', kind: 'workflow-step', parent: 'workflow', open: true },
];

async function replay(): Promise<{ journal: ReturnType<typeof createRunJournal>; records: JournalRecord[] }> {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-spans-'));
  dirs.push(homeDir);
  const journal = createRunJournal({ homeDir });
  let tick = 0;
  const recorder = createSpanRecorder({
    journal,
    // A deterministic clock: one minute per step keeps ordering explicit.
    now: () => new Date(Date.parse('2026-09-14T09:00:00.000Z') + tick++ * 60_000).toISOString(),
  });

  for (const span of FIXTURE) {
    await recorder.open({
      projectId: PROJECT, runId: RUN, operationId: span.id, kind: span.kind,
      ...(span.parent ? { parentOperationId: span.parent } : {}),
      ...(span.links ? { linkedOperationIds: span.links } : {}),
    });
    if (!span.open) {
      await recorder.close({ projectId: PROJECT, runId: RUN, operationId: span.id, outcome: span.outcome ?? 'ok' });
    }
  }

  const page = await journal.readPage(PROJECT, RUN, { limit: 500 });
  return { journal, records: page.records };
}

const startsOf = (records: JournalRecord[]) => records.filter((r) => r.recordKind === 'operation-start');
const endsOf = (records: JournalRecord[]) => records.filter((r) => r.recordKind === 'operation-end');

describe('a complete run contains every activity exactly once', () => {
  it('opens every span once and never invents one', async () => {
    const { records } = await replay();
    const starts = startsOf(records);
    expect(starts).toHaveLength(FIXTURE.length);
    const ids = starts.map((record) => record.operationId);
    expect(new Set(ids).size).toBe(FIXTURE.length);
    expect(new Set(ids)).toEqual(new Set(FIXTURE.map((span) => span.id)));
  });

  it('closes every finished span exactly once and leaves the unfinished one open', async () => {
    const { records } = await replay();
    const ends = endsOf(records);
    const finished = FIXTURE.filter((span) => !span.open).map((span) => span.id);
    expect(ends.map((record) => record.operationId).sort()).toEqual([...finished].sort());
    // The unfinished step is visible as started and never closed.
    expect(ends.some((record) => record.operationId === 'workflow:step-3')).toBe(false);
    expect(startsOf(records).some((record) => record.operationId === 'workflow:step-3')).toBe(true);
  });

  it('preserves real containment and nothing else', async () => {
    const { records } = await replay();
    const parents = new Map(startsOf(records).map((record) => [record.operationId, record.parentOperationId ?? null]));
    for (const span of FIXTURE) {
      expect(parents.get(span.id)).toBe(span.parent ?? null);
    }
    // A run-level operation has no parent; a nested one never points at the run.
    expect(parents.get('owner-wake')).toBeNull();
    expect(parents.get('workflow:step-2:capture')).toBe('workflow:step-2');
  });

  it('links handoffs without implying the sender worked throughout', async () => {
    const { records } = await replay();
    const byId = new Map(startsOf(records).map((record) => [record.operationId, record]));
    expect(byId.get('room:synthesis')?.linkedOperationIds).toEqual(['room:member-renderer', 'room:member-tests']);
    expect(byId.get('workflow:review')?.linkedOperationIds).toEqual(['workflow:step-2']);
    // A link is not a parent: the linked spans are siblings under different parents.
    expect(byId.get('workflow:review')?.parentOperationId).toBe('workflow');
    expect(byId.get('workflow:step-2')?.parentOperationId).toBe('workflow');
  });

  it('records the failed attempt as failed and the retry as its own operation', async () => {
    const { records } = await replay();
    const byId = new Map(endsOf(records).map((record) => [record.operationId, record]));
    expect(byId.get('workflow:step-1:attempt-1')?.outcome).toBe('failed');
    expect(byId.get('workflow:step-1:attempt-2')?.outcome).toBe('ok');
    expect(byId.get('planning:repair')?.outcome).toBe('failed');
    expect(byId.get('planning:repair:retry')?.outcome).toBe('ok');
    // A retry is a distinct operation, not a second end on the first one.
    expect(endsOf(records).filter((record) => record.operationId === 'workflow:step-1:attempt-1')).toHaveLength(1);
  });

  it('covers every activity class the change names', async () => {
    const { records } = await replay();
    const kinds = new Set(startsOf(records).map((record) => record.operationKind));
    for (const kind of ['research', 'repair', 'trigger-extraction', 'evaluation', 'workflow-attempt', 'evidence', 'delivery']) {
      expect(kinds, `fixture must cover ${kind}`).toContain(kind);
    }
  });

  it('folds each activity into the summary exactly once, even when replayed', async () => {
    const { journal } = await replay();
    const seen: string[] = [];
    const fold = (record: JournalRecord, summary: Parameters<Parameters<typeof journal.checkpoint>[2]>[1]) => {
      if (record.recordKind === 'operation-start') seen.push(String(record.operationId));
      return summary;
    };
    await journal.checkpoint(PROJECT, RUN, fold, '2026-09-14T12:00:00.000Z');
    expect(seen).toHaveLength(FIXTURE.length);

    // A restart that folds again must not see any of them a second time.
    seen.length = 0;
    await journal.checkpoint(PROJECT, RUN, fold, '2026-09-14T12:05:00.000Z');
    expect(seen).toEqual([]);
  });
});
