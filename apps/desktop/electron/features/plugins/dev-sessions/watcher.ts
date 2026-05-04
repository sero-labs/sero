import fs from 'fs';
import path from 'path';

const DEBOUNCE_MS = 250;
const RESTART_DELAY_MS = 2_000;

const REFRESH_ROOT_FILES = new Set(['package.json']);
const REFRESH_ROOT_DIRS = new Set(['extension', 'runtime', 'shared', 'prompts', 'skills']);
const IGNORED_ROOT_DIRS = new Set(['ui', 'dist', 'node_modules', 'coverage', 'test-results']);
const IGNORED_ROOT_FILE_PREFIXES = ['.'];

export type PluginDevSessionWatchChangeKind = 'resources' | 'ui' | 'ignore';

interface SessionWatcherEntry {
  sessionId: string;
  sourcePath: string;
  watcher: fs.FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  uiDebounceTimer: ReturnType<typeof setTimeout> | null;
}

export class PluginDevSessionWatcher {
  private readonly watchers = new Map<string, SessionWatcherEntry>();

  constructor(
    private readonly onRefreshRequested: (sessionId: string) => void | Promise<void>,
    private readonly onUiChangeRequested: (sessionId: string) => void | Promise<void> = () => undefined,
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
      uiDebounceTimer: null,
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

      entry.watcher = fs.watch(entry.sourcePath, { recursive: true }, (_eventType, filename) => {
        const changeKind = classifyPluginDevSessionPath(filename);
        if (changeKind === 'resources') {
          this.scheduleRefresh(entry);
        } else if (changeKind === 'ui') {
          this.scheduleUiChange(entry);
        }
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

    if (entry.uiDebounceTimer) {
      clearTimeout(entry.uiDebounceTimer);
      entry.uiDebounceTimer = null;
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

  private scheduleUiChange(entry: SessionWatcherEntry): void {
    if (entry.uiDebounceTimer) {
      clearTimeout(entry.uiDebounceTimer);
    }

    entry.uiDebounceTimer = setTimeout(() => {
      entry.uiDebounceTimer = null;
      void this.onUiChangeRequested(entry.sessionId);
    }, DEBOUNCE_MS);
  }
}

export function shouldRefreshPluginDevSessionPath(filename: string | Buffer | null): boolean {
  return classifyPluginDevSessionPath(filename) === 'resources';
}

export function classifyPluginDevSessionPath(
  filename: string | Buffer | null,
): PluginDevSessionWatchChangeKind {
  if (!filename) return 'resources';

  const normalized = filename.toString().replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  const root = parts[0];
  if (!root) return 'resources';

  if (REFRESH_ROOT_FILES.has(root)) return 'resources';
  if (REFRESH_ROOT_DIRS.has(root)) return 'resources';
  if (root === 'ui') return 'ui';
  if (IGNORED_ROOT_DIRS.has(root)) return 'ignore';
  if (IGNORED_ROOT_FILE_PREFIXES.some((prefix) => root.startsWith(prefix))) return 'ignore';

  return 'ignore';
}
