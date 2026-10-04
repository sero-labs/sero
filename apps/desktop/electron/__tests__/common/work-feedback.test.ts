import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFeedback,
  createFeedbackProducer,
  createFeedbackProjection,
  feedbackActivity,
  feedbackEventFromSession,
  feedbackWaitMs,
  mergeFeedback,
  openRunFeedback,
  summarizeFeedback,
  type ObservationRecord,
  type WorkFeedback,
  type WorkFeedbackInit,
} from '@sero-ai/common';

const START = Date.parse('2026-01-01T00:00:00.000Z');
/** An ISO time `ms` after the fake clock's start. */
const at = (ms: number): string => new Date(START + ms).toISOString();

const init = (key = 'p1', workId = 'w1'): WorkFeedbackInit => ({
  key, kind: 'room-member', owner: 'agent', scope: { appId: 'app', workspaceId: 'ws', workId },
});

function newProducer(epoch = 'e1') {
  let revision = 0;
  return createFeedbackProducer(init(), epoch, () => ++revision);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('work feedback producer', () => {
  it('lists a producer that only opened, so a late view still sees it', () => {
    const projection = createFeedbackProjection('e1');
    projection.open(init('quiet'));

    const reply = projection.reply();

    expect(reply.epoch).toBe('e1');
    expect(reply.snapshots.map((entry) => entry.key)).toEqual(['quiet']);
    expect(reply.snapshots[0].attached).toBe(false);
  });

  it('keeps a quiet model request as contact and leaves the activity time alone', () => {
    const producer = newProducer();
    producer.observe({ type: 'output', at: at(0) });

    const snapshot = producer.observe({ type: 'request-start', id: 'r1', model: 'm', at: at(5000) });

    expect(snapshot.wait).toEqual({ kind: 'request', since: at(5000), model: 'm' });
    expect(snapshot.contactObservedAt).toBe(at(5000));
    expect(snapshot.lastActivityAt).toBe(at(0));
  });

  it('names the open tool, clears it at the tool end, and counts output as activity', () => {
    const producer = newProducer();

    const started = producer.observe({ type: 'tool-start', id: 't1', toolName: 'bash', at: at(1000) });
    expect(started.wait).toEqual({ kind: 'tool', toolName: 'bash', since: at(1000) });

    const ended = producer.observe({ type: 'tool-end', id: 't1', at: at(2000) });
    expect(ended.wait).toBeNull();
    expect(ended.openCalls).toBe(0);

    const written = producer.observe({ type: 'output', at: at(3000) });
    expect(written.lastActivityAt).toBe(at(3000));
  });

  it('keeps naming the tool still open when one of two parallel calls ends', () => {
    const producer = newProducer();
    producer.observe({ type: 'tool-start', id: 'a', toolName: 'read', at: at(0) });
    const both = producer.observe({ type: 'tool-start', id: 'b', toolName: 'grep', at: at(100) });
    expect(both.openCalls).toBe(2);

    const one = producer.observe({ type: 'tool-end', id: 'a', at: at(200) });

    expect(one.openCalls).toBe(1);
    expect(one.wait).toEqual({ kind: 'tool', toolName: 'grep', since: at(100) });
  });

  it('drops calls left open by the turn before when a new turn starts', () => {
    const producer = newProducer();
    producer.observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    producer.observe({ type: 'tool-start', id: 'a', toolName: 'bash', at: at(100) });

    const next = producer.observe({ type: 'turn-start', turnId: 't2', at: at(5000) });

    expect(next.openCalls).toBe(0);
    expect(next.wait).toBeNull();
    expect(next.turnId).toBe('t2');
  });

  it('stays terminal after the end, reads complete or stopped, and still takes late usage', () => {
    const done = newProducer();
    const failed = newProducer();
    done.observe({ type: 'end', outcome: 'ok', at: at(1000) });
    failed.observe({ type: 'end', outcome: 'failed', at: at(1000) });

    expect(feedbackActivity(done.snapshot(), 'e1')).toBe('complete');
    expect(feedbackActivity(failed.snapshot(), 'e1')).toBe('stopped');

    const late = done.observe({ type: 'output', at: at(9000) });
    expect(late.lastActivityAt).toBe(at(1000));
    expect(late.terminal).toEqual({ outcome: 'ok', at: at(1000) });
    expect(late.attached).toBe(false);

    const usage = done.observe({ type: 'usage', costUsd: 0.5, incomplete: false });
    expect(usage.usage).toEqual({ costUsd: 0.5, incomplete: false });
    expect(usage.terminal?.outcome).toBe('ok');
  });

  it('maps session events: text uses the host clock, a compaction is not feedback', () => {
    expect(feedbackEventFromSession({ type: 'text', text: 'secret words' }, at(7000))).toEqual({ type: 'output', at: at(7000) });
    expect(feedbackEventFromSession({ type: 'compacted', at: at(1) }, at(2))).toBeNull();
  });
});

describe('work feedback ordering', () => {
  function twoSnapshots(epoch = 'e1'): { older: WorkFeedback; newer: WorkFeedback } {
    const producer = newProducer(epoch);
    const older = producer.observe({ type: 'turn-start', turnId: 't', at: at(0) });
    const newer = producer.observe({ type: 'output', at: at(1000) });
    return { older, newer };
  }

  it('keeps the higher revision, so a late older snapshot does not roll the view back', () => {
    const { older, newer } = twoSnapshots();

    expect(mergeFeedback(newer, older, 'e1')).toBe(newer);
    expect(mergeFeedback(older, newer, 'e1')).toBe(newer);

    const map = new Map([[newer.key, newer]]);
    expect(applyFeedback(map, [older], 'e1')).toBe(map);
    expect(applyFeedback(new Map([[older.key, older]]), [newer], 'e1').get(newer.key)).toBe(newer);
  });

  it('never lets a snapshot from another epoch replace the current one', () => {
    const { newer } = twoSnapshots('e1');
    const foreign = twoSnapshots('e0').newer;

    expect(mergeFeedback(newer, { ...foreign, revision: 999 }, 'e1')).toBe(newer);
  });

  it('reads a snapshot from another epoch as last known, never working', () => {
    const producer = newProducer('e0');
    const snapshot = producer.observe({ type: 'output', at: at(0) });
    expect(snapshot.attached).toBe(true);

    expect(feedbackActivity(snapshot, 'e0')).toBe('working');
    expect(feedbackActivity(snapshot, 'e1')).toBe('last-known');
  });
});

describe('work feedback projection', () => {
  it('marks matching attached producers lost without claiming an outcome, and drop removes them', () => {
    const projection = createFeedbackProjection('e1');
    projection.open(init('a', 'room-1')).observe({ type: 'tool-start', id: 't', toolName: 'bash', at: at(0) });
    projection.open(init('b', 'room-2')).observe({ type: 'output', at: at(0) });

    projection.lose((entry) => entry.scope.workId === 'room-1');

    const [lost, kept] = projection.list();
    expect(lost.attached).toBe(false);
    expect(lost.terminal).toBeNull();
    expect(lost.wait).toBeNull();
    expect(lost.lastActivityAt).toBe(at(0));
    expect(feedbackActivity(lost, 'e1')).toBe('last-known');
    expect(feedbackActivity(kept, 'e1')).toBe('working');

    projection.drop('a');
    expect(projection.list().map((entry) => entry.key)).toEqual(['b']);
  });

  it('pushes output at most once a second but pushes a request or tool change at once', () => {
    const emit = vi.fn();
    const producer = createFeedbackProjection('e1', emit).open(init());

    producer.observe({ type: 'output', at: at(0) });
    producer.observe({ type: 'output', at: at(100) });
    producer.observe({ type: 'output', at: at(900) });
    expect(emit).toHaveBeenCalledTimes(1);

    producer.observe({ type: 'tool-start', id: 't', toolName: 'bash', at: at(950) });
    producer.observe({ type: 'request-start', id: 'r', at: at(960) });
    expect(emit).toHaveBeenCalledTimes(3);

    producer.observe({ type: 'output', at: at(1000) });
    expect(emit).toHaveBeenCalledTimes(4);
  });

  it('still folds output it did not push, so a later read is current', () => {
    const projection = createFeedbackProjection('e1', vi.fn());
    const producer = projection.open(init());

    producer.observe({ type: 'output', at: at(0) });
    producer.observe({ type: 'output', at: at(400) });

    expect(projection.list()[0].lastActivityAt).toBe(at(400));
  });
});

describe('work feedback summary', () => {
  it('counts working producers, names at most the limit, and reports the latest activity', () => {
    const projection = createFeedbackProjection('e1');
    projection.open(init('a')).observe({ type: 'output', at: at(1000) });
    projection.open(init('b')).observe({ type: 'output', at: at(9000) });
    projection.open(init('c')).observe({ type: 'output', at: at(5000) });
    const ended = projection.open(init('d'));
    ended.observe({ type: 'output', at: at(100) });
    ended.observe({ type: 'end', outcome: 'ok', at: at(200) });

    const summary = summarizeFeedback(projection.list(), 'e1', 2);

    expect(summary.activeCount).toBe(3);
    expect(summary.current.map((entry) => entry.key)).toEqual(['a', 'b']);
    expect(summary.lastActivityAt).toBe(at(9000));
  });
});

describe('structured run feedback', () => {
  const record = (kind: ObservationRecord['kind'], operationId: string, extra: Partial<ObservationRecord> = {}): ObservationRecord => ({
    kind, identities: { operationId }, ...extra,
  });

  it('takes the watch id from the first observation only, and ends terminal when the caller ends it', () => {
    const projection = createFeedbackProjection('e1');
    const run = openRunFeedback(projection, init('run'));

    run.onObservation(record('operation-start', 'tracker-1', { startedAt: at(0) }));
    run.onObservation(record('request-start', 'session-9', { startedAt: at(100) }));
    run.onObservation(record('operation-end', 'session-9', { endedAt: at(200), outcome: 'ok' }));

    const running = projection.list()[0];
    expect(running.watchRunId).toBe('tracker-1');
    expect(running.terminal).toBeNull();

    run.end({ error: 'boom' }, at(300));

    const ended = projection.list()[0];
    expect(ended.terminal).toEqual({ outcome: 'failed', at: at(300) });
    expect(ended.watchRunId).toBe('tracker-1');
  });
});

describe('work feedback wait time', () => {
  it('is null when the wait has no measured start, never zero', () => {
    const producer = newProducer();
    const unmeasured = producer.observe({ type: 'tool-start', id: 't', toolName: 'bash', at: null });
    expect(unmeasured.wait).toEqual({ kind: 'tool', toolName: 'bash', since: null });

    expect(feedbackWaitMs(unmeasured, Date.now())).toBeNull();
    expect(feedbackWaitMs(newProducer().snapshot(), Date.now())).toBeNull();
  });

  it('measures from the start time to now', () => {
    const producer = newProducer();
    const waiting = producer.observe({ type: 'request-start', id: 'r', at: at(0) });

    vi.advanceTimersByTime(4000);

    expect(feedbackWaitMs(waiting, Date.now())).toBe(4000);
  });
});
