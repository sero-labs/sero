import { describe, expect, it } from 'vitest';
import type { Loop } from '../../shared/types';
import { deriveCreateStage } from '../lib/create-stage';

const loop = (pendingInput: boolean): Loop =>
  ({ runtime: { pendingInput: pendingInput ? { questions: [] } : undefined } } as Loop);

describe('deriveCreateStage', () => {
  it('starts on describe with no loop id yet', () => {
    expect(deriveCreateStage(null, null)).toBe('describe');
  });

  it('shows planning once a loop id exists but the loop is not read yet', () => {
    expect(deriveCreateStage('loop-1', null)).toBe('planning');
  });

  it('shows clarify when the loop is parked on a planner question', () => {
    expect(deriveCreateStage('loop-1', loop(true))).toBe('clarify');
  });

  it('shows review once the plan exists and nothing is pending', () => {
    expect(deriveCreateStage('loop-1', loop(false))).toBe('review');
  });
});
