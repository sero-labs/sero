import fs from 'fs';
import path from 'path';

const DEBOUNCE_MS = 250;
const RESTART_DELAY_MS = 2_000;

interface SessionWatcherEntry {
  sessionId: string;
  sourcePath: string;
  watcher: fs.FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

export class PluginDevSessionWatcher {
  private readonly watchers = new Map<string, SessionWatcherEntry>();

  constructor(
    private readonly onRefreshRequested: (sessionId: string) => void | Promise<void>,
  ) {}

  watch(sessionId: string, sourcePath: string): void {
    const normalizedSourcePath = path.resolve(sourcePath);
    const existing = this.watchers.get(sessionId);

    if (existing) {
      if (existing.sourcePath === normalizedSourcePath && existing.watcher) {
        return;
      }
      this.stopWatching(existing);
      existing.sourcePath = normalizedSourcePath;
      this.startWatching(existing);
      return;
    }

    const entry: SessionWatcherEntry = {
      sessionId,
      sourcePath: normalizedSourcePath,
      watcher: null,
      debounceTimer: null,
    };

    this.watchers.set(sessionId, entry);
    this.startWatching(entry);
  }

  unwatch(sessionId: string): void {
    const entry = this.watchers.get(sessionId);
    if (!entry) return;

    this.stopWatching(entry);
    this.watchers.delete(sessionId);
  }

  dispose(): void {
    for (const entry of this.watchers.values()) {
      this.stopWatching(entry);
    }
    this.watchers.clear();
  }

  private startWatching(entry: SessionWatcherEntry): void {
    if (entry.watcher) return;

    try {
      if (!fs.existsSync(entry.sourcePath)) {
        console.warn(`[plugin-dev-watcher] Skipping missing source path for ${entry.sessionId}: ${entry.sourcePath}`);
        return;
      }

      entry.watcher = fs.watch(entry.sourcePath, { recursive: true }, () => {
        this.scheduleRefresh(entry);
      });

      entry.watcher.on('error', (error) => {
        console.warn(
          `[plugin-dev-watcher] Watch error for ${entry.sessionId} (${entry.sourcePath}):`,
          error.message,
        );
        this.stopWatching(entry);
        setTimeout(() => {
          const current = this.watchers.get(entry.sessionId);
          if (current) {
            this.startWatching(current);
          }
        }, RESTART_DELAY_MS);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn(
        `[plugin-dev-watcher] Failed to watch ${entry.sessionId} (${entry.sourcePath}): ${message}`,
      );
    }
  }

  private stopWatching(entry: SessionWatcherEntry): void {
    if (entry.watcher) {
      entry.watcher.close();
      entry.watcher = null;
    }

    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = null;
    }
  }

  private scheduleRefresh(entry: SessionWatcherEntry): void {
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }

    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null;
      void this.onRefreshRequested(entry.sessionId);
    }, DEBOUNCE_MS);
  }
}
