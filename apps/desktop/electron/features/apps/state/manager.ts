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
import { BrowserWindow } from 'electron';
import { IpcChannels } from '../../../../src/types/ipc';

// ── Types ────────────────────────────────────────────────────

interface WatcherEntry {
  watcher: FSWatcher;
  /** Number of renderer subscriptions for this file. */
  refCount: number;
  /** Debounce timer for change events. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

// ── AppStateManager ──────────────────────────────────────────

type ChangeListener = (filePath: string, data: unknown) => void;

class AppStateManager {
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
      existing.refCount++;
      return;
    }

    // Ensure directory exists before watching
    const dir = path.dirname(filePath);
    fs.mkdir(dir, { recursive: true }).then(async () => {
      // Touch file if missing so fs.watch has something to watch.
      // MUST await — startWatcher needs the file to exist on disk.
      try {
        await fs.writeFile(filePath, '', { flag: 'wx' });
      } catch {
        /* file already exists — fine */
      }

      try {
        this.startWatcher(filePath);
        const entry = this.watchers.get(filePath)!;
        entry.refCount = 1;
      } catch (err) {
        console.error(`[AppStateManager] Failed to watch ${filePath}:`, err);
      }
    });
  }

  /**
   * Stop watching a state file. Decrements ref count; closes watcher at 0.
   */
  unwatch(filePath: string): void {
    const entry = this.watchers.get(filePath);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      entry.watcher.close();
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      this.watchers.delete(filePath);
    }
  }

  // ── Watcher lifecycle ─────────────────────────────────────

  /**
   * Create (or re-create) an fs.watch for a file.
   * On macOS, atomic writes (tmp → rename) invalidate the watcher
   * because the inode changes. We detect 'rename' events and
   * re-establish the watcher after a short delay.
   */
  private startWatcher(filePath: string): void {
    const existing = this.watchers.get(filePath);
    if (existing?.watcher) {
      existing.watcher.close();
    }

    const watcher = watch(filePath, { persistent: false }, (eventType) => {
      if (eventType === 'rename') {
        // Inode changed (atomic write) — re-establish watcher then notify.
        // Retry up to 3 times in case the file is briefly absent.
        this.reestablishWatcher(filePath, 0);
      } else if (eventType === 'change') {
        this.handleFileChange(filePath);
      }
    });

    const refCount = existing?.refCount ?? 0;
    const debounceTimer = existing?.debounceTimer ?? null;
    this.watchers.set(filePath, { watcher, refCount, debounceTimer });
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
        this.startWatcher(filePath);
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
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.appState.change, filePath, data);
    }
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

  dispose(): void {
    for (const [, entry] of this.watchers) {
      entry.watcher.close();
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    }
    this.watchers.clear();
    this.writeQueues.clear();
  }
}

// ── Singleton ────────────────────────────────────────────────

export const appStateManager = new AppStateManager();
