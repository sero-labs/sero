/**
 * Registry of captures that a running command owns.
 *
 * A capture directory exists before any session file references it: the bash
 * tool creates the directory on its first write and the reference appears only
 * after `finish()`. Retention cannot tell such a capture from an orphan, so it
 * asks here first. Without this, deleting one session can remove a capture that
 * another session is still writing.
 */

const active = new Set<string>();

/** Note that a capture belongs to a command that has not published a result yet. */
export function registerActiveCapture(directory: string): void {
  active.add(directory);
}

/** Release a capture once its result is published, or once it is discarded. */
export function releaseActiveCapture(directory: string): void {
  active.delete(directory);
}

/** Capture directories that retention must keep. */
export function activeCaptureDirectories(): ReadonlySet<string> {
  return active;
}
