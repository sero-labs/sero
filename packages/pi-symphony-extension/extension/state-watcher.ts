/**
 * State file watcher — syncs UI-driven changes back to orchestrator.
 *
 * Watches the directory containing state.json for changes. Uses
 * directory watch (not file watch) because atomic writes change the
 * file's inode. Debounces 500ms and prevents own-write feedback.
 */

import { watch, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FSWatcher } from 'node:fs';
import type { SymphonyState, PendingIssueCreate } from '../shared/types';
import type { Orchestrator } from './orchestrator';
import { info, warn } from './logger';

const DEBOUNCE_MS = 500;

export interface StateWatcherCallbacks {
  getOrchestrator: () => Orchestrator | null;
  onPendingCreates?: (pending: PendingIssueCreate[]) => Promise<void>;
}

export class StateWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private filePath: string;
  private dirPath: string;
  private fileName: string;
  private callbacks: StateWatcherCallbacks;
  private ignoreUntil = 0;

  constructor(filePath: string, callbacks: StateWatcherCallbacks) {
    this.filePath = filePath;
    this.dirPath = path.dirname(filePath);
    this.fileName = path.basename(filePath);
    this.callbacks = callbacks;
  }

  /** Suppress watcher from re-reading our own write. */
  markOwnWrite(): void {
    this.ignoreUntil = Date.now() + DEBOUNCE_MS + 200;
  }

  start(): void {
    if (this.watcher) return;

    try {
      this.watcher = watch(this.dirPath, { persistent: false }, (_event, filename) => {
        if (filename === this.fileName || filename?.startsWith(this.fileName + '.tmp')) {
          this.scheduleSync();
        }
      });

      this.watcher.on('error', (err) => {
        warn('state-watcher:error', { error: err.message });
        this.stop();
      });

      info('state-watcher:start', { path: this.filePath, mode: 'directory' });
    } catch (err) {
      warn('state-watcher:start-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      info('state-watcher:stop');
    }
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.sync(), DEBOUNCE_MS);
  }

  private async sync(): Promise<void> {
    if (Date.now() < this.ignoreUntil) return;

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const state: SymphonyState = JSON.parse(raw);

      // Process pending issue creates (works even when orchestrator is stopped)
      if (state.pendingIssueCreates?.length > 0 && this.callbacks.onPendingCreates) {
        await this.callbacks.onPendingCreates(state.pendingIssueCreates);
      }

      const orchestrator = this.callbacks.getOrchestrator();

      // If UI toggled service off, stop the orchestrator
      if (orchestrator?.isActive() && !state.serviceActive) {
        info('state-watcher:ui-stop');
        orchestrator.stop();
      }

      info('state-watcher:sync', {
        running: state.running?.length ?? 0,
        retrying: state.retrying?.length ?? 0,
      });
    } catch (err) {
      // File might be mid-write; ignore transient errors
      warn('state-watcher:sync-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
