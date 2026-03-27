/**
 * State file watcher — keeps the scheduler in sync with state.json.
 *
 * When the UI (or any external process) writes to state.json, the
 * watcher detects the change and pushes updated jobs + reminders into
 * the scheduler's in-memory lists.
 *
 * Uses DIRECTORY watch instead of file watch because state.json is
 * written atomically (tmp + rename). On macOS, fs.watch tracks the
 * inode, so after a rename the file watcher is orphaned. Watching
 * the parent directory detects rename events reliably.
 */

import { watch, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FSWatcher } from 'node:fs';
import type { CronState } from '../shared/types';
import type { CronScheduler } from './scheduler';
import { info, warn } from './logger';

const DEBOUNCE_MS = 500;

export class StateWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private filePath: string;
  private dirPath: string;
  private fileName: string;
  private getScheduler: () => CronScheduler | null;
  /** Track our own writes to avoid feedback loops. */
  private ignoreUntil = 0;

  constructor(filePath: string, getScheduler: () => CronScheduler | null) {
    this.filePath = filePath;
    this.dirPath = path.dirname(filePath);
    this.fileName = path.basename(filePath);
    this.getScheduler = getScheduler;
  }

  /**
   * Call before writing state.json from the extension to suppress
   * the watcher from re-reading our own write.
   */
  markOwnWrite(): void {
    this.ignoreUntil = Date.now() + DEBOUNCE_MS + 200;
  }

  start(): void {
    if (this.watcher) return;

    try {
      // Watch the DIRECTORY, not the file. Atomic writes (rename) change
      // the file's inode, but the directory inode stays stable.
      this.watcher = watch(this.dirPath, { persistent: false }, (_event, filename) => {
        // Filter: only react to changes to the state file (or its tmp files)
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
    // Skip if this is our own write
    if (Date.now() < this.ignoreUntil) return;

    const scheduler = this.getScheduler();
    if (!scheduler?.isRunning()) return;

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const state: CronState = JSON.parse(raw);
      if (!state.reminders) state.reminders = [];

      scheduler.updateJobs(state.jobs ?? []);
      scheduler.updateReminders(state.reminders);

      info('state-watcher:sync', {
        jobs: state.jobs?.length ?? 0,
        reminders: state.reminders.length,
      });
    } catch (err) {
      // File might be mid-write (temp → rename); ignore transient errors
      warn('state-watcher:sync-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
