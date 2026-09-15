/**
 * Observed waits (spec architect-run-observability).
 *
 * A wait is recorded only when the runtime saw both ends of it. An interval
 * nobody measured stays unknown: inventing one would describe time that was
 * never observed, and the inspector could not tell the difference.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunJournal, type JournalRecord } from '../run-journal';
import { createSpanRecorder } from '../spans';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const PROJECT = 'hollow-depths';
const RUN = 'run-initial';
const T = (minutes: number) => new Date(Date.parse('2026-09-14T09:00:00.000Z') + minutes * 60_000).toISOString();

async function harness() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-waits-'));
  dirs.push(homeDir);
  const journal = createRunJournal({ homeDir });
  // A controllable clock, so a test can place an operation's start and end
  // exactly where it wants them relative to an observed wait.
  let minutes = 0;
  const recorder = createSpanRecorder({ journal, now: () => T(minutes) });
  const read = async (): Promise<JournalRecord[]> => (await journal.readPage(PROJECT, RUN, { limit: 500 })).records;
  return { journal, recorder, read, at: (value: number) => { minutes = value; } };
}

describe('observed waits', () => {
  it('records a wait from the two timestamps the runtime saw, and its cause', async () => {
    const { recorder, read } = await harness();
    await recorder.recordObservedWait({
      projectId: PROJECT, runId: RUN, operationId: 'approval-1', kind: 'wait', waitCause: 'approval',
      startedAt: T(41), endedAt: T(48),
    });

    const records = await read();
    const opened = records.find((record) => record.recordKind === 'operation-start');
    const closed = records.find((record) => record.recordKind === 'operation-end');
    expect(opened).toMatchObject({ operationKind: 'wait', waitCause: 'approval', at: T(41) });
    expect(closed).toMatchObject({ operationId: 'approval-1', at: T(48) });
    // The duration is the observed interval, not a guess from surrounding events.
    expect(Date.parse(String(closed?.at)) - Date.parse(String(opened?.at))).toBe(7 * 60_000);
  });

  it('records nothing when an end was never observed', async () => {
    const { recorder, read } = await harness();
    await recorder.recordObservedWait({
      projectId: PROJECT, runId: RUN, operationId: 'pause-1', kind: 'wait', waitCause: 'pause',
      startedAt: T(50), endedAt: '',
    });
    await recorder.recordObservedWait({
      projectId: PROJECT, runId: RUN, operationId: 'backoff-1', kind: 'wait', waitCause: 'backoff',
      startedAt: T(60), endedAt: T(55),
    });
    // An impossible interval is a bookkeeping error, not a negative wait.
    expect(await read()).toEqual([]);
  });

  it('leaves a second worker active while another operation waits for approval', async () => {
    const { recorder, read, at } = await harness();
    // One worker runs from minute 40 to minute 60 while the approval wait sits
    // inside that interval.
    at(40);
    await recorder.open({ projectId: PROJECT, runId: RUN, operationId: 'step-2', kind: 'workflow-step' });
    await recorder.recordObservedWait({
      projectId: PROJECT, runId: RUN, operationId: 'approval-1', kind: 'wait', waitCause: 'approval',
      startedAt: T(41), endedAt: T(48),
    });
    at(60);
    await recorder.close({ projectId: PROJECT, runId: RUN, operationId: 'step-2', outcome: 'ok' });

    const records = await read();
    const stepStart = records.find((record) => record.operationId === 'step-2' && record.recordKind === 'operation-start');
    const stepEnd = records.find((record) => record.operationId === 'step-2' && record.recordKind === 'operation-end');
    const waitStart = records.find((record) => record.operationId === 'approval-1' && record.recordKind === 'operation-start');
    const waitEnd = records.find((record) => record.operationId === 'approval-1' && record.recordKind === 'operation-end');

    // The wait sits inside the worker's interval and neither replaces nor
    // shortens it: the worker stays active for its whole span.
    expect(Date.parse(String(waitStart?.at))).toBeGreaterThan(Date.parse(String(stepStart?.at)));
    expect(Date.parse(String(waitEnd?.at))).toBeLessThan(Date.parse(String(stepEnd?.at)));
    expect(stepStart?.operationKind).toBe('workflow-step');
    expect(waitStart?.operationKind).toBe('wait');
    // Neither is derived from the other: both are separate operations.
    expect(stepStart?.parentOperationId).toBeUndefined();
    expect(waitStart?.parentOperationId).toBeUndefined();
  });

  it('does not close a still-running child when its parent stops', async () => {
    const { recorder, read } = await harness();
    await recorder.open({ projectId: PROJECT, runId: RUN, operationId: 'workflow', kind: 'workflow' });
    await recorder.open({ projectId: PROJECT, runId: RUN, operationId: 'workflow:step-3', kind: 'workflow-step', parentOperationId: 'workflow' });

    // The owner is stopped. Only the parent is closed; the child keeps running.
    await recorder.close({ projectId: PROJECT, runId: RUN, operationId: 'workflow', outcome: 'unknown' });

    const records = await read();
    const ends = records.filter((record) => record.recordKind === 'operation-end');
    expect(ends.map((record) => record.operationId)).toEqual(['workflow']);
    // The child is still open, so its later usage stays attributable to this run.
    const childEnd = ends.find((record) => record.operationId === 'workflow:step-3');
    expect(childEnd).toBeUndefined();
  });
});
