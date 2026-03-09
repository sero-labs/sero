/**
 * View Transitions helper.
 *
 * Wraps state updates in `document.startViewTransition()` when available
 * (Chromium 111+, which Electron supports). Falls back to immediate update.
 * Uses `flushSync` to ensure React commits the DOM change synchronously
 * within the transition callback — required for the browser to capture
 * correct before/after snapshots.
 */

import { flushSync } from 'react-dom';

/**
 * Run a state-updating callback inside a View Transition.
 * The callback MUST call React setState (or similar) to trigger a DOM change.
 */
export function withViewTransition(callback: () => void): void {
  if (!document.startViewTransition) {
    callback();
    return;
  }

  document.startViewTransition(() => {
    flushSync(callback);
  });
}
