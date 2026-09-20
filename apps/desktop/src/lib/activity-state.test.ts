import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_STATES,
  ACTIVITY_STATE_GLYPH,
  ACTIVITY_STATE_WORD,
  activityNextStep,
  isLive,
  missingActivityDetail,
  type ActivityState,
} from '@sero-ai/common';

describe('activity vocabulary', () => {
  it('gives every state a word', () => {
    for (const state of ACTIVITY_STATES) {
      expect(ACTIVITY_STATE_WORD[state].trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every state a glyph no other state uses', () => {
    const glyphs = ACTIVITY_STATES.map((state) => ACTIVITY_STATE_GLYPH[state]);
    expect(new Set(glyphs).size).toBe(ACTIVITY_STATES.length);
  });

  it('names what starts armed work', () => {
    expect(
      activityNextStep('waiting-for-trigger', {
        triggers: 'a GitHub issue, a CI failure or Mondays 08:00',
      }),
    ).toBe('Starts on a GitHub issue, a CI failure or Mondays 08:00.');
  });

  it('names the cause and the action of a stop', () => {
    expect(
      activityNextStep('stopped', {
        cause: 'The run stopped before it finished',
        action: 'Retry the step',
      }),
    ).toBe('The run stopped before it finished. Retry the step.');
  });

  it('withholds a sentence when its required detail is missing', () => {
    expect(missingActivityDetail('stopped', { cause: 'Stopped by the spend cap' })).toEqual(['action']);
    expect(activityNextStep('stopped', { cause: 'Stopped by the spend cap' })).toBeNull();
    expect(activityNextStep('waiting-for-you', {})).toBeNull();
    expect(activityNextStep('last-known', { lastReport: '3 days ago' })).toBe(
      'No report since 3 days ago. Open the work to check.',
    );
  });

  it('asks nothing of the states that stand alone', () => {
    const standalone: ActivityState[] = ['working', 'queued', 'paused', 'idle', 'complete'];
    for (const state of standalone) {
      expect(missingActivityDetail(state, {})).toEqual([]);
      expect(activityNextStep(state, {})).not.toBeNull();
    }
  });
});

describe('isLive', () => {
  const session = '2026-09-19T10:00:00.000Z';
  const mark = (reportedAt: string) => ({ runId: 'run_1', startedAt: reportedAt, reportedAt });

  it('accepts a report from this session', () => {
    expect(isLive(mark('2026-09-19T10:00:01.000Z'), session)).toBe(true);
  });

  it('rejects a report left by an earlier session', () => {
    expect(isLive(mark('2026-09-16T08:12:00.000Z'), session)).toBe(false);
  });

  it('rejects a missing mark and an unreadable time', () => {
    expect(isLive(null, session)).toBe(false);
    expect(isLive(mark('not a time'), session)).toBe(false);
    expect(isLive(mark(session), null)).toBe(false);
  });
});
