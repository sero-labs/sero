/**
 * AppStateManager — generic file watcher + atomic read/write for app state.
 *
 * Each Sero app has a JSON state file (e.g. .sero/apps/todo/state.json).
 * This manager handles:
 *   - Reading state from disk
 *   - Atomic writes (write to tmp, then fs.rename)
 *   - fs.watch() for change notifications (macOS uses FSEvents — reliable)
 *   - Serialised write queue to prevent concurrent writes
 *
 * Used by both the IPC layer (renderer ↔ main) and the Pi extension
 * (which writes directly to the same file).
 */

import { promises as fs } from 'fs';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { IpcChannels } from '@/types/ipc-channels';
import { broadcastToWindows } from '@electron/ipc/lib/window-broadcast';

// ── Types ────────────────────────────────────────────────────

interface WatcherEntry {
  watcher: FSWatcher | null;
  /** Number of renderer subscriptions for this file. */
  refCount: number;
  /** Debounce timer for change events. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** True while async watch bootstrap is in progress. */
  initializing: boolean;
  /** True when all refs were released before bootstrap completed. */
  cancelled: boolean;
  /** Tracks the in-flight bootstrap so failure/cleanup is deterministic. */
  setupPromise: Promise<void> | null;
}

// ── AppStateManager ──────────────────────────────────────────

type ChangeListener = (filePath: string, data: unknown) => void;

export class AppStateManager {
  private watchers = new Map<string, WatcherEntry>();
  private writeQueues = new Map<string, Promise<void>>();
  private changeListeners: ChangeListener[] = [];

  /**
   * Register a listener for file change events (from fs.watch).
   * Used by the kanban orchestrator to react to state changes
   * from ANY source (extension direct writes, IPC writes, etc.).
   */
  onFileChange(listener: ChangeListener): void {
    this.changeListeners.push(listener);
  }

  // ── Read ─────────────────────────────────────────────────

  async read(filePath: string): Promise<unknown> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Read a file as raw UTF-8 text (no JSON parsing). Returns null if missing. */
  async readText(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  // ── Remove ────────────────────────────────────────────────

  async remove(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      /* file already gone — fine */
    }
  }

  // ── Write (atomic, serialised) ───────────────────────────

  async write(filePath: string, data: unknown): Promise<void> {
    // Chain writes per file to serialise them
    const prev = this.writeQueues.get(filePath) ?? Promise.resolve();
    const next = prev.then(() => this.atomicWrite(filePath, data));
    this.writeQueues.set(filePath, next);
    await next;
  }

  /**
   * Atomic read-modify-write: the updater callback runs inside the
   * serialised write queue so no concurrent read can see stale data.
   *
   * Use this instead of separate read() + write() when multiple
   * callers may update the same file concurrently (e.g. parallel
   * subtask completion in the kanban orchestrator).
   */
  async update<T = unknown>(
    filePath: string,
    updater: (current: T | null) => T,
  ): Promise<void> {
    const prev = this.writeQueues.get(filePath) ?? Promise.resolve();
    const next = prev.then(async () => {
      const current = await this.read(filePath) as T | null;
      const updated = updater(current);
      await this.atomicWrite(filePath, updated);
    });
    this.writeQueues.set(filePath, next);
    await next;
  }

  private async atomicWrite(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const json = JSON.stringify(data, null, 2);

    await fs.writeFile(tmpPath, json, 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  // ── Watch ────────────────────────────────────────────────

  /**
   * Start watching a state file. Increments ref count if already watched.
   * Pushes `sero:app-state:change` events to all renderer windows.
   */
  watch(filePath: string): void {
    const existing = this.watchers.get(filePath);
    if (existing) {
      existing.refCount += 1;
      existing.cancelled = false;
      return;
    }

    const entry: WatcherEntry = {
      watcher: null,
      refCount: 1,
      debounceTimer: null,
      initializing: true,
      cancelled: false,
      setupPromise: null,
    };

    this.watchers.set(filePath, entry);
    entry.setupPromise = this.initializeWatcher(filePath, entry);
  }

  /**
   * Stop watching a state file. Decrements ref count; closes watcher at 0.
   */
  unwatch(filePath: string): void {
    const entry = this.watchers.get(filePath);
    if (!entry) return;

    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount > 0) return;

    entry.cancelled = true;
    if (!entry.initializing) {
      this.disposeWatcherEntry(filePath, entry);
    }
  }

  // ── Watcher lifecycle ─────────────────────────────────────

  /**
   * Create (or re-create) an fs.watch for a file.
   * On macOS, atomic writes (tmp → rename) invalidate the watcher
   * because the inode changes. We detect 'rename' events and
   * re-establish the watcher after a short delay.
   */
  private async initializeWatcher(filePath: string, entry: WatcherEntry): Promise<void> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (!this.shouldKeepWatching(filePath, entry)) return;

      // Touch file if missing so fs.watch has something to watch.
      // MUST await — startWatcher needs the file to exist on disk.
      await this.ensureFileExists(filePath);
      if (!this.shouldKeepWatching(filePath, entry)) return;

      this.startWatcher(filePath, entry);
    } catch (err) {
      console.error(`[AppStateManager] Failed to watch ${filePath}:`, err);
      entry.cancelled = true;
    } finally {
      const current = this.watchers.get(filePath);
      if (current !== entry) return;

      current.initializing = false;
      current.setupPromise = null;

      if (current.cancelled || current.refCount <= 0 || !current.watcher) {
        this.disposeWatcherEntry(filePath, current);
      }
    }
  }

  private shouldKeepWatching(filePath: string, entry: WatcherEntry): boolean {
    return this.watchers.get(filePath) === entry && !entry.cancelled && entry.refCount > 0;
  }

  private async ensureFileExists(filePath: string): Promise<void> {
    try {
      await fs.writeFile(filePath, '{}', { flag: 'wx' });
    } catch (err) {
      if (!isAlreadyExistsError(err)) {
        throw err;
      }
    }
  }

  private startWatcher(filePath: string, entry: WatcherEntry): void {
    entry.watcher?.close();
    entry.watcher = watch(filePath, { persistent: false }, (eventType) => {
      const current = this.watchers.get(filePath);
      if (current !== entry || current.refCount <= 0) return;

      if (eventType === 'rename') {
        // Inode changed (atomic write) — re-establish watcher then notify.
        // Retry up to 3 times in case the file is briefly absent.
        this.reestablishWatcher(filePath, 0);
      } else if (eventType === 'change') {
        this.handleFileChange(filePath);
      }
    });
  }

  /**
   * Re-establish a watcher after a rename event (atomic write).
   * Retries up to 3 times with increasing delay if the file is
   * briefly absent between unlink and rename.
   */
  private reestablishWatcher(filePath: string, attempt: number): void {
    const delay = attempt === 0 ? 50 : 150;
    setTimeout(() => {
      const entry = this.watchers.get(filePath);
      if (!entry || entry.refCount <= 0) return;

      try {
        this.startWatcher(filePath, entry);
        this.handleFileChange(filePath);
      } catch (err) {
        if (attempt < 3) {
          this.reestablishWatcher(filePath, attempt + 1);
        } else {
          console.error(`[AppStateManager] Failed to re-establish watcher for ${filePath}:`, err);
        }
      }
    }, delay);
  }

  // ── Change notification ──────────────────────────────────

  private handleFileChange(filePath: string): void {
    const entry = this.watchers.get(filePath);
    if (!entry) return;

    // Debounce: multiple FSEvents can fire for a single write
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(async () => {
      entry.debounceTimer = null;
      try {
        const data = await this.read(filePath);
        this.pushChange(filePath, data);
      } catch (err) {
        console.error(`[AppStateManager] Error reading ${filePath}:`, err);
      }
    }, 50);
  }

  private pushChange(filePath: string, data: unknown): void {
    broadcastToWindows(IpcChannels.appState.change, filePath, data);
    // Notify registered listeners (e.g. kanban orchestrator)
    for (const listener of this.changeListeners) {
      try {
        listener(filePath, data);
      } catch (err) {
        console.error('[AppStateManager] Listener error:', err);
      }
    }
  }

  // ── Cleanup ──────────────────────────────────────────────

  private disposeWatcherEntry(filePath: string, entry: WatcherEntry): void {
    entry.watcher?.close();
    entry.watcher = null;

    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = null;
    }

    if (this.watchers.get(filePath) === entry) {
      this.watchers.delete(filePath);
    }
  }

  dispose(): void {
    for (const [filePath, entry] of this.watchers) {
      this.disposeWatcherEntry(filePath, entry);
    }
    this.watchers.clear();
    this.writeQueues.clear();
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

// ── Singleton ────────────────────────────────────────────────

export const appStateManager = new AppStateManager();
