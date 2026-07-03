/**
 * Filesystem event source (`fs:changed`, spec 12 Phase 3).
 *
 * Watches the workspace root recursively while at least one active loop
 * subscribes; a debounce window batches changes into ONE event with the
 * changed paths as payload (`{ paths, count }`). Default ignores keep the
 * loop's own machinery (git internals, orchestrator state, dependencies,
 * managed worktrees) from firing it. Pure push — no polling.
 *
 * Path scoping is semantic, not mechanical: the structured `eventFilter`
 * matches by equality and cannot express "under docs/", so scope conditions
 * ("only when files under docs/ change") belong in `eventCondition`, which the
 * model judges against the batch.
 */

import { existsSync, watch, type FSWatcher } from 'node:fs';
import { basename, join } from 'node:path';
import type { OrchestratorHost } from '../host';
import type { EmitEvent, EventSourceAdapter, EventSubscription } from './types';

/** Window that batches a burst of file changes into one event. */
const DEFAULT_DEBOUNCE_MS = 400;

/** Path segments that never count as workspace changes (`.sero` covers managed worktrees). */
const IGNORED_SEGMENTS = new Set(['.git', '.sero', 'node_modules']);

export function isIgnoredPath(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS.has(segment));
}

export function createFsAdapter(
  host: OrchestratorHost,
  emit: EmitEvent,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): EventSourceAdapter {
  let watcher: FSWatcher | undefined;
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    const paths = [...pending].sort();
    pending = new Set();
    if (paths.length === 0) return;
    void emit({
      id: host.newId('evt'),
      source: 'fs:changed',
      payload: { paths, count: paths.length },
      occurredAt: host.now(),
      summary: `${paths.length} file${paths.length === 1 ? '' : 's'} changed in the workspace`,
    }).catch((error) => host.log(`fs adapter: emit failed: ${error}`));
  };

  const onChange = (_type: string, filename: string | Buffer | null): void => {
    if (!filename) return;
    const relative = filename.toString();
    if (isIgnoredPath(relative)) return;
    // FSEvents artifact (macOS): a change to the watched root ITSELF is
    // reported under the root's own basename. That is directory-entry noise,
    // not a workspace file change — drop it unless such a child really exists.
    if (relative === basename(host.workspacePath) && !existsSync(join(host.workspacePath, relative))) return;
    pending.add(relative);
    if (!timer) timer = setTimeout(flush, debounceMs);
  };

  const start = (): void => {
    if (watcher) return;
    try {
      watcher = watch(host.workspacePath, { recursive: true }, onChange);
      watcher.on('error', (error) => host.log(`fs adapter: watch error: ${error}`));
      host.log('fs adapter: watching workspace');
    } catch (error) {
      host.log(`fs adapter: could not watch workspace: ${error}`);
    }
  };

  const stop = (): void => {
    watcher?.close();
    watcher = undefined;
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = new Set();
  };

  return {
    namespace: 'fs',
    sync(subscriptions: EventSubscription[]): void {
      if (subscriptions.length > 0) start();
      else if (watcher) {
        stop();
        host.log('fs adapter: stopped (no subscribers)');
      }
    },
    dispose: stop,
  };
}
