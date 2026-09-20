/**
 * One rule for a Workflow's state word. The case that matters most is the last
 * one: a saved active run with no live mark must never read as working.
 */

import { describe, expect, it } from 'vitest';
import type { LoopSummary } from '../../shared/types';
import { armedTriggerWords, isLoopActive, loopActivity, scheduleWords } from '../lib/loop-activity';

const SESSION = '2026-09-19T10:00:00.000Z';
const REPORTED_NOW = '2026-09-19T10:05:00.000Z';
const REPORTED_BEFORE = '2026-09-16T08:12:00.000Z';

function summary(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return {
    id: 'loop-1',
    title: 'reading-tracker-resilience-01: maintenance',
    status: 'active',
    summary: '',
    prompt: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-14T08:00:00.000Z',
    ...overrides,
  };
}

describe('loopActivity', () => {
  it('reads a live run as working, named by its step', () => {
    const activity = loopActivity(
      summary({
        liveRun: { runId: 'run-9', startedAt: REPORTED_NOW, reportedAt: REPORTED_NOW },
        progress: { total: 3, done: 1, running: true },
        activeStepTitles: ['M2 · Adversarial review'],
      }),
      SESSION,
    );

    expect(activity.state).toBe('working');
    expect(activity.word).toBe('Working');
    expect(activity.nextStep).toBe('Working on M2 · Adversarial review.');
  });

  it('reads an armed Workflow as waiting for a trigger and names what starts it', () => {
    const activity = loopActivity(
      summary({
        armedEventSources: ['github:issue-opened', 'github:ci-failed'],
        schedules: [{ triggerId: 't', type: 'cron', schedule: '0 8 * * 1' }],
        lastRunAt: '2026-09-14T08:00:00.000Z',
      }),
      SESSION,
    );

    expect(activity.state).toBe('waiting-for-trigger');
    expect(activity.nextStep).toBe('Starts on a GitHub issue, a CI failure or Mondays 08:00.');
  });

  it('reads a finished Workflow as complete, suggestions and all', () => {
    const activity = loopActivity(
      summary({ status: 'complete', pendingSuggestions: 3 }),
      SESSION,
    );

    expect(activity.state).toBe('complete');
  });

  it('reads a turned-off Workflow as paused', () => {
    expect(loopActivity(summary({ status: 'disabled' }), SESSION).state).toBe('paused');
  });

  it('reads a blocked Workflow as stopped, with its cause and the action that clears it', () => {
    const activity = loopActivity(
      summary({ status: 'blocked', block: { reason: 'Stopped by the spend cap', limit: 'maxCostUsd' } }),
      SESSION,
    );

    expect(activity.state).toBe('stopped');
    expect(activity.nextStep).toBe('Stopped by the spend cap. Raise the cap.');
    expect(activity.action).toBe('Raise the cap');
  });

  it('reads a pending question as waiting for you', () => {
    const activity = loopActivity(summary({ pendingInput: 1 }), SESSION);

    expect(activity.state).toBe('waiting-for-you');
    expect(activity.action).toBe('Answer the question');
  });

  it('counts suggested changes as the action, without overriding a finished Workflow', () => {
    const activity = loopActivity(summary({ pendingSuggestions: 3 }), SESSION);

    expect(activity.state).toBe('waiting-for-you');
    expect(activity.nextStep).toBe('Review 3 suggested changes.');
  });

  it('reads a planned Workflow as queued and a bare one as idle', () => {
    expect(loopActivity(summary({ status: 'draft' }), SESSION).state).toBe('queued');
    expect(loopActivity(summary(), SESSION).state).toBe('idle');
  });

  it('reads a saved running run with no report from this session as last known', () => {
    const activity = loopActivity(
      summary({
        progress: { total: 2, done: 1, running: true },
        liveRun: { runId: 'run-3', startedAt: REPORTED_BEFORE, reportedAt: REPORTED_BEFORE },
        lastRunAt: REPORTED_BEFORE,
        activeStepTitles: ['M2 · Adversarial review'],
      }),
      SESSION,
    );

    expect(activity.state).toBe('last-known');
    expect(activity.word).toBe('Last known');
    expect(activity.nextStep).toContain('No report since');
  });

  it('agrees with the active count Home shows', () => {
    const armed = summary({ armedEventSources: ['github:ci-failed'] });
    const running = summary({ liveRun: { runId: 'r', startedAt: REPORTED_NOW, reportedAt: REPORTED_NOW } });

    expect(isLoopActive(armed, SESSION)).toBe(false);
    expect(loopActivity(armed, SESSION).word).toBe('Waiting for a trigger');
    expect(isLoopActive(running, SESSION)).toBe(true);
  });
});

describe('trigger words', () => {
  it('words the plain cron shapes and leaves the rest as the expression', () => {
    expect(scheduleWords('0 8 * * 1')).toBe('Mondays 08:00');
    expect(scheduleWords('0 2 * * *')).toBe('daily 02:00');
    expect(scheduleWords('*/15 * * * *')).toBe('the schedule */15 * * * *');
  });

  it('leaves out a paused schedule and an exhausted one', () => {
    const loop = summary({
      schedules: [
        { triggerId: 'a', type: 'cron', schedule: '0 8 * * 1', paused: true },
        { triggerId: 'b', type: 'cron', schedule: '0 9 * * 2', exhausted: true },
      ],
    });

    expect(armedTriggerWords(loop)).toBeUndefined();
  });
});
