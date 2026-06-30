import { describe, expect, it } from 'vitest';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { loopCardStatus } from '../lib/loop-card';

const summary = (over: Partial<LoopSummary>): LoopSummary =>
  ({ id: 'l', title: 't', status: 'active', summary: '', prompt: '', createdAt: 't', updatedAt: 't', ...over } as LoopSummary);

describe('loopCardStatus', () => {
  it('shows a progress bar for a running loop, with the current step 1-indexed', () => {
    expect(loopCardStatus(summary({ progress: { running: true, done: 2, total: 5 } })))
      .toEqual({ kind: 'progress', done: 2, total: 5, current: 3 });
  });

  it('caps the current step at the total on the final step', () => {
    expect(loopCardStatus(summary({ progress: { running: true, done: 5, total: 5 } })))
      .toMatchObject({ kind: 'progress', current: 5 });
  });

  it('falls back to a status line when running but the plan has no steps', () => {
    expect(loopCardStatus(summary({ status: 'active', progress: { running: true, done: 0, total: 0 } })))
      .toEqual({ kind: 'text', text: 'Active', tone: 'muted' });
  });

  it('marks a complete loop muted and asks for the relative-time suffix', () => {
    expect(loopCardStatus(summary({ status: 'complete' })))
      .toEqual({ kind: 'text', text: 'Complete', tone: 'muted', showRelativeTime: true });
  });

  it('distinguishes a blocked loop that needs input from a plain block', () => {
    expect(loopCardStatus(summary({ status: 'blocked', pendingInput: 1 })))
      .toEqual({ kind: 'text', text: 'Blocked — needs input', tone: 'blocked' });
    expect(loopCardStatus(summary({ status: 'blocked' })))
      .toEqual({ kind: 'text', text: 'Blocked', tone: 'blocked' });
  });

  it('uses the status label for draft/disabled', () => {
    expect(loopCardStatus(summary({ status: 'draft' as LoopStatus }))).toMatchObject({ kind: 'text', text: 'Draft' });
    expect(loopCardStatus(summary({ status: 'disabled' as LoopStatus }))).toMatchObject({ kind: 'text', text: 'Disabled' });
  });
});
