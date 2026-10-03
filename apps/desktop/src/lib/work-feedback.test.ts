import { describe, expect, it } from 'vitest';
import {
  applyFeedback,
  createFeedbackProjection,
  feedbackActivity,
  feedbackEventFromObservation,
  feedbackWaitMs,
  summarizeFeedback,
  type WorkFeedback,
  type WorkFeedbackInit,
} from '@sero-ai/common';

const EPOCH = '2026-10-03T09:00:00.000Z';
const T0 = Date.parse('2026-10-03T10:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

function member(key: string, over: Partial<WorkFeedbackInit> = {}): WorkFeedbackInit {
  return { key, kind: 'room-member', owner: key, scope: { appId: 'orchestrator', workspaceId: 'ws-1', runId: 'room-1', memberId: key }, ...over };
}

function projection(epoch = EPOCH) {
  const emitted: WorkFeedback[] = [];
  return { emitted, feedback: createFeedbackProjection(epoch, (snapshot) => emitted.push(snapshot)) };
}

describe('contact and activity are different facts', () => {
  it('keeps a quiet attached request working and leaves the activity time alone', () => {
    const { feedback } = projection();
    const producer = feedback.open(member('m1'));
    producer.observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    producer.observe({ type: 'tool-start', id: 'c1', toolName: 'read', at: at(1) });
    producer.observe({ type: 'tool-end', id: 'c1', at: at(2) });
    producer.observe({ type: 'request-start', id: 'r1', model: 'p/m', at: at(3) });

    const [snapshot] = feedback.list();
    expect(feedbackActivity(snapshot, EPOCH)).toBe('working');
    expect(snapshot.wait).toEqual({ kind: 'request', since: at(3), model: 'p/m' });
    expect(snapshot.lastActivityAt).toBe(at(2));
    expect(snapshot.contactObservedAt).toBe(at(3));
    // Two quiet minutes later the wait is an observed duration, not progress.
    expect(feedbackWaitMs(snapshot, T0 + 123_000)).toBe(120_000);
    expect(snapshot.lastActivityAt).toBe(at(2));
  });

  it('reads last known once the producer is lost, without calling it failed', () => {
    const { feedback } = projection();
    const producer = feedback.open(member('m1'));
    producer.observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    producer.observe({ type: 'tool-start', id: 'c1', toolName: 'bash', at: at(5) });
    feedback.lose((entry) => entry.scope.runId === 'room-1');

    const [snapshot] = feedback.list();
    expect(feedbackActivity(snapshot, EPOCH)).toBe('last-known');
    expect(snapshot.terminal).toBeNull();
    expect(snapshot.lastActivityAt).toBe(at(5));
  });

  it('leaves a timing the source did not report unavailable', () => {
    const { feedback } = projection();
    const producer = feedback.open(member('step', { kind: 'workflow-step' }));
    const event = feedbackEventFromObservation({ kind: 'request-start', identities: { operationId: 'op-1', requestId: 'r1' } });
    if (event) producer.observe(event);

    const [snapshot] = feedback.list();
    expect(snapshot.wait).toEqual({ kind: 'request', since: null });
    expect(feedbackWaitMs(snapshot, T0)).toBeNull();
    expect(snapshot.lastActivityAt).toBeNull();
    expect(feedbackActivity(snapshot, EPOCH)).toBe('working');
  });

  it('keeps a terminal fact terminal when a late event arrives', () => {
    const { feedback } = projection();
    const producer = feedback.open(member('step', { kind: 'workflow-step' }));
    producer.observe({ type: 'turn-start', turnId: null, at: at(0) });
    producer.observe({ type: 'end', outcome: 'failed', at: at(9) });
    producer.observe({ type: 'tool-start', id: 'late', toolName: 'bash', at: at(10) });

    const [snapshot] = feedback.list();
    expect(feedbackActivity(snapshot, EPOCH)).toBe('stopped');
    expect(snapshot.wait).toBeNull();
    expect(snapshot.attached).toBe(false);
  });

  it('does not treat a snapshot from an earlier session as working', () => {
    const earlier = projection('2026-10-02T09:00:00.000Z');
    earlier.feedback.open(member('m1')).observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    expect(feedbackActivity(earlier.feedback.list()[0], EPOCH)).toBe('last-known');
  });
});

describe('a reader keeps the newest snapshot', () => {
  it('ignores an out-of-order update and one from another epoch', () => {
    const { feedback, emitted } = projection();
    const producer = feedback.open(member('m1'));
    producer.observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    producer.observe({ type: 'turn-end', at: at(4) });
    producer.observe({ type: 'turn-start', turnId: 't2', at: at(5) });
    const [first, ended, second] = emitted;

    // The reply arrives, then the older pushed updates arrive late.
    let view = applyFeedback(new Map(), [second], EPOCH);
    view = applyFeedback(view, [first, ended], EPOCH);
    expect(view.get('m1')?.turnId).toBe('t2');

    const stale = { ...second, epoch: '2026-10-02T09:00:00.000Z', revision: 999, turnId: 'old' };
    expect(applyFeedback(view, [stale], EPOCH)).toBe(view);
  });

  it('sorts a producer reopened under the same key after the one it replaced', () => {
    const { feedback, emitted } = projection();
    feedback.open(member('m1')).observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    feedback.open(member('m1')).observe({ type: 'turn-start', turnId: 't2', at: at(9) });
    const view = applyFeedback(new Map(), [emitted[1], emitted[0]], EPOCH);
    expect(view.get('m1')?.turnId).toBe('t2');
  });
});

describe('a parent summary', () => {
  it('names concurrent work instead of the last worker to report', () => {
    const { feedback } = projection();
    const step = feedback.open(member('step', { kind: 'workflow-step', owner: 'builder', subject: 'Build the parser' }));
    const one = feedback.open(member('m1'));
    const two = feedback.open(member('m2'));
    step.observe({ type: 'turn-start', turnId: null, at: at(0) });
    one.observe({ type: 'turn-start', turnId: 't1', at: at(1) });
    two.observe({ type: 'turn-start', turnId: 't2', at: at(2) });
    two.observe({ type: 'tool-start', id: 'c', toolName: 'bash', at: at(3) });

    const summary = summarizeFeedback(feedback.list(), EPOCH, 2);
    expect(summary.activeCount).toBe(3);
    expect(summary.current.map((entry) => entry.owner)).toEqual(['builder', 'm1']);
    expect(summary.lastActivityAt).toBe(at(3));
  });
});

describe('the projection pushes metadata, not tokens', () => {
  it('sends one update for a burst of output and none of its text', () => {
    const { feedback, emitted } = projection();
    const producer = feedback.open(member('m1'));
    producer.observe({ type: 'turn-start', turnId: 't1', at: at(0) });
    for (let token = 0; token < 50; token += 1) producer.observe({ type: 'output', at: new Date(T0 + 1000 + token * 10).toISOString() });

    expect(emitted).toHaveLength(2);
    expect(JSON.stringify(emitted)).not.toMatch(/text|summary|args/);
    // The snapshot a late reader asks for still has the newest activity time.
    expect(feedback.list()[0].lastActivityAt).toBe(new Date(T0 + 1490).toISOString());
  });
});
