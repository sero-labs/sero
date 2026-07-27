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
    expect(decidePreviewLoad({ loadCount: 1, announced: true })).toEqual({ action: 'expected' });
  });

  it('stops a first load that never announced itself', () => {
    // The parser-time escape: the page replaces itself while it is still being
    // read, so the document we built never finishes and never reports ready.
    // What fires `load` is the page it went to — arriving as the load the count
    // on its own would have trusted.
    const outcome = decidePreviewLoad({ loadCount: 1, announced: false });

    expect(outcome.action).toBe('blank');
    expect(outcome).toHaveProperty('reason');
  });

  it('stops the frame on the load after that, and says why', () => {
    const outcome = decidePreviewLoad({ loadCount: 2, announced: true });

    expect(outcome.action).toBe('blank');
    expect(outcome).toHaveProperty('reason');
  });

  it('settles: emptying the frame is not itself reported as another escape', () => {
    // `about:blank` fires its own load. Reacting to it would report a second
    // warning for one attempt — and, if the reaction were to restore the page
    // instead, would never stop.
    expect(decidePreviewLoad({ loadCount: 3, announced: true })).toEqual({ action: 'ignore' });
    expect(decidePreviewLoad({ loadCount: 4, announced: false })).toEqual({ action: 'ignore' });

    const actions = Array.from(
      { length: 50 },
      (_, index) => decidePreviewLoad({ loadCount: index + 1, announced: true }).action,
    );
    expect(actions.filter((action) => action === 'blank')).toHaveLength(1);
  });
});
