/**
 * What to do when a preview frame loads a document nobody asked it to.
 *
 * `Location` is [Unforgeable], so a generated page can always replace itself and
 * in-page guards cannot stop it. The surface can only notice afterwards — the
 * load event is the one signal available — which makes the decision here about
 * *containment*, not prevention: the navigated document keeps its sandbox flags
 * and still cannot reach Sero, storage or the filesystem, but it has a network
 * again and is no longer carrying the preview's policy.
 *
 * The rule is therefore: put nothing back. Restoring the blob would run the same
 * page again, which would navigate again, which would restore again — a reload
 * loop that never settles and hammers whatever it was navigating to. The frame is
 * emptied instead, once, and the user is told what happened.
 *
 * Kept as a pure decision so it can be tested without a DOM: the wiring in
 * `PreviewFrame` is three lines, and this is the part with a rule in it.
 */

export type PreviewLoadOutcome =
  | { action: 'expected' }
  | { action: 'blank'; reason: string }
  | { action: 'ignore' };

/**
 * @param loadCount how many times the frame has fired `load` for this document,
 *   counting the one being handled now. The first is the document being placed
 *   there; any load after it is the page going somewhere else.
 */
export function decidePreviewLoad(loadCount: number): PreviewLoadOutcome {
  if (loadCount <= 1) return { action: 'expected' };
  if (loadCount === 2) {
    return {
      action: 'blank',
      reason: 'the page tried to load a different document, so the preview was stopped',
    };
  }
  // Already blanked. `about:blank` fires its own load, and reporting that would
  // add a second warning for one escape attempt.
  return { action: 'ignore' };
}
