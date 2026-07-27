import { describe, expect, it } from 'vitest';

import { decidePreviewLoad } from './preview-navigation';

/**
 * The rule the preview frame follows when it loads something nobody asked for.
 * The property that matters is termination: the first attempt at this restored
 * the blob URL, which re-ran the same page, which navigated again — a reload loop
 * that never settled and kept hitting whatever it was navigating to.
 */

describe('deciding what a frame load means', () => {
  it('treats the first load as the document being placed there', () => {
    expect(decidePreviewLoad(1)).toEqual({ action: 'expected' });
  });

  it('stops the frame on the load after that, and says why', () => {
    const outcome = decidePreviewLoad(2);

    expect(outcome.action).toBe('blank');
    expect(outcome).toHaveProperty('reason');
  });

  it('settles: emptying the frame is not itself reported as another escape', () => {
    // `about:blank` fires its own load. Reacting to it would report a second
    // warning for one attempt — and, if the reaction were to restore the page
    // instead, would never stop.
    expect(decidePreviewLoad(3)).toEqual({ action: 'ignore' });
    expect(decidePreviewLoad(4)).toEqual({ action: 'ignore' });

    const actions = Array.from({ length: 50 }, (_, index) => decidePreviewLoad(index + 1).action);
    expect(actions.filter((action) => action === 'blank')).toHaveLength(1);
  });
});
