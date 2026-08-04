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
 * Counting loads is not enough on its own. A page that navigates *while it is
 * being parsed* never finishes the document we put there, so that document never
 * fires `load` and the remote one arrives as the first load — the very load the
 * count is written to trust. What separates them is the harness: our document
 * announces itself, and a document that loaded without announcing itself is not
 * ours. Hence `announced` below.
 *
 * That announcement is a diagnostic, not a boundary, and cannot be made into one
 * from here: the harness runs inside the document it is vouching for, so a page
 * determined to escape can read its own source, hand the parent's message shape
 * to whatever it navigates to, and have that page announce in its place. The
 * honest guarantee is the sandbox — no same-origin, no Sero, no storage, no
 * files — plus a request that is noticed and a frame that is emptied. Refusing
 * the request itself has to happen in the host, which owns the frame; the
 * renderer only ever finds out afterwards.
 *
 * Kept as a pure decision so it can be tested without a DOM: the wiring in
 * `PreviewFrame` is a handler and a timer, and this is the part with a rule in it.
 */

export type PreviewLoadOutcome =
  | { action: 'expected' }
  | { action: 'blank'; reason: string }
  | { action: 'ignore' };

export interface PreviewLoad {
  /**
   * How many times the frame has fired `load` for this document, counting the
   * one being handled now. The first is the document being placed there; any
   * load after it is the page going somewhere else.
   */
  loadCount: number;
  /**
   * Whether the harness inside the frame has reported itself ready since the
   * frame was mounted. Only the document the runtime built can do that.
   */
  announced: boolean;
}

export function decidePreviewLoad({ loadCount, announced }: PreviewLoad): PreviewLoadOutcome {
  if (loadCount <= 1) {
    return announced
      ? { action: 'expected' }
      : {
          action: 'blank',
          reason:
            'the page replaced itself while it was loading, so the preview was stopped before it ran',
        };
  }
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
