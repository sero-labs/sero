/** Captures still running or waiting for their result reference to reach disk. */
const active = new Set<string>();
const awaitingReferences = new Map<string, string>();

export function registerActiveCapture(directory: string): void {
  active.add(directory);
}

/** A finalized result can still be inside an asynchronous tool_result hook. */
export function awaitCaptureReference(directory: string, captureId: string): void {
  awaitingReferences.set(directory, captureId);
  active.delete(directory);
}

/** Empty, failed, or discarded captures have no complete output to protect. */
export function releaseActiveCapture(directory: string): void {
  active.delete(directory);
  awaitingReferences.delete(directory);
}

/** Snapshot protection so a concurrent publication cannot invalidate a sweep. */
export function activeCaptureDirectories(): ReadonlySet<string> {
  return new Set([...active, ...awaitingReferences.keys()]);
}

/** Only a persisted reference can take over protection from the command. */
export function releasePersistedCaptureReferences(captureIds: ReadonlySet<string>): void {
  for (const [directory, captureId] of awaitingReferences) {
    if (captureIds.has(captureId)) awaitingReferences.delete(directory);
  }
}
