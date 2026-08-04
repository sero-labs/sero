import { flushSync } from 'react-dom';

/**
 * Animating the move between the grid and an opened reference.
 *
 * The browser does the work: give the same `view-transition-name` to the card
 * image and to the opened reference's image, and it morphs one into the other.
 * No stylesheet is involved, which matters here — plugin CSS is wrapped in
 * `@scope`, and `::view-transition-*` pseudo-elements live on the document
 * root, outside any scope. The browser defaults are the whole effect.
 *
 * The name is a single constant rather than one per item: only one reference
 * is ever mid-transition, and `view-transition-name` has to be unique in the
 * document at the moment it is captured.
 */

export const REFERENCE_TRANSITION_NAME = 'dl-open-reference';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Run a navigation as a view transition.
 *
 * `prepare` runs first and is flushed to the DOM before anything is captured —
 * that is how the outgoing element gets its transition name in time, since
 * naming an element has no visual effect of its own.
 *
 * Falls back to a plain update when the browser lacks the API or the user has
 * asked for reduced motion. Either way the navigation happens; only the
 * animation is optional.
 */
export function navigateWithTransition(update: () => void, prepare?: () => void): void {
  if (prepare) flushSync(prepare);

  // Typed by the DOM lib, but still absent in older engines — hence the
  // runtime check rather than a bare call.
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    update();
    return;
  }

  // React batches by default, so the callback has to flush or the browser
  // captures the "after" state before React has produced it.
  document.startViewTransition(() => flushSync(update));
}
