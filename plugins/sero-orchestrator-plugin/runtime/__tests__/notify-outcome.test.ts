import { describe, expect, it } from 'vitest';
import type { Loop } from '../../shared/types';
import { outcomeNotification } from '../notify-outcome';

function loopWith(status: Loop['status'], block?: { reason?: string }): Loop {
  return {
    title: 'Nightly cleanup',
    status,
    runtime: { block: block ? { kind: 'recovery-block', reason: block.reason, createdAt: 't' } : undefined },
  } as Loop;
}

describe('outcomeNotification', () => {
  it('reports a completed loop as info with its title', () => {
    expect(outcomeNotification(loopWith('complete'))).toEqual({
      message: 'Workflow "Nightly cleanup" finished.',
      level: 'info',
    });
  });

  it('reports a blocked loop as a warning that includes the block reason', () => {
    expect(outcomeNotification(loopWith('blocked', { reason: 'cost limit reached' }))).toEqual({
      message: 'Workflow "Nightly cleanup" is blocked — cost limit reached.',
      level: 'warning',
    });
  });

  it('still warns when a block has no reason', () => {
    expect(outcomeNotification(loopWith('blocked'))).toEqual({
      message: 'Workflow "Nightly cleanup" is blocked.',
      level: 'warning',
    });
  });

  it('reports nothing for a non-terminal run (active/draft/disabled)', () => {
    expect(outcomeNotification(loopWith('active'))).toBeNull();
    expect(outcomeNotification(loopWith('draft'))).toBeNull();
    expect(outcomeNotification(loopWith('disabled'))).toBeNull();
  });
});
