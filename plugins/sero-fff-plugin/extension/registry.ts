/**
 * Plugin-owned registry of FFF finders, keyed by effective workspace root.
 *
 * One Sero process runs many agent sessions at once — the chat, its subagents,
 * Room members, app sessions — and most of them sit on the same worktree. An
 * index per session would scan the same tree repeatedly and hold N watchers on
 * it, so consumers on the same canonical root share one finder and the finder
 * is destroyed when the last of them releases it.
 *
 * This is deliberately an implementation detail of the plugin. Nothing here is
 * exposed as a host capability, and the host has no FFF-specific seam.
 */

import type { FileFinderApi, InitOptions } from '@ff-labs/fff-node';

import { loadFinderSdk, type FileFinderStatic } from './sdk';
import { resolveDbPaths } from './paths';

/** Bounds start-up: a cold scan of a very large repository must not hang a session. */
export const SCAN_TIMEOUT_MS = 15_000;

export interface AcquireOptions {
  /** Canonical workspace or worktree root. */
  root: string;
  /** Opaque per-session token. The same token acquiring twice counts once. */
  consumerId: string;
}

interface RegistryEntry {
  root: string;
  finder: FileFinderApi;
  consumers: Set<string>;
}

export interface FinderRegistryOptions {
  /** Overridden in tests; production reads the profile-scoped agent directory. */
  dbPaths?: { frecency: string; history: string };
  scanTimeoutMs?: number;
  onDbFailure?: (error: string) => void;
}

export class FinderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FinderUnavailableError';
  }
}

export class FinderRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /** In-flight creations, so concurrent acquires on one root scan once. */
  private readonly pending = new Map<string, Promise<RegistryEntry>>();

  /** Which roots each consumer holds, so a shutdown releases all of them. */
  private readonly holdings = new Map<string, Set<string>>();

  /** Set once the databases could not be opened; later finders skip them. */
  private dbDisabled = false;

  constructor(private readonly options: FinderRegistryOptions = {}) {}

  get databasesDisabled(): boolean {
    return this.dbDisabled;
  }

  size(): number {
    return this.entries.size;
  }

  /** Consumers currently holding `root`, for tests and diagnostics. */
  refCount(root: string): number {
    return this.entries.get(root)?.consumers.size ?? 0;
  }

  async acquire({ root, consumerId }: AcquireOptions): Promise<FileFinderApi> {
    const existing = this.entries.get(root);
    if (existing && !existing.finder.isDestroyed) {
      this.track(consumerId, root, existing);
      return existing.finder;
    }

    const inflight = this.pending.get(root);
    if (inflight) {
      const entry = await inflight;
      this.track(consumerId, root, entry);
      return entry.finder;
    }

    const creation = this.create(root).finally(() => this.pending.delete(root));
    this.pending.set(root, creation);
    const entry = await creation;
    this.track(consumerId, root, entry);
    return entry.finder;
  }

  /** Releases one root held by a consumer, destroying the finder when it is the last. */
  release(consumerId: string, root: string): void {
    const held = this.holdings.get(consumerId);
    if (held) {
      held.delete(root);
      if (held.size === 0) this.holdings.delete(consumerId);
    }

    const entry = this.entries.get(root);
    if (!entry) return;
    entry.consumers.delete(consumerId);
    if (entry.consumers.size > 0) return;

    this.entries.delete(root);
    if (!entry.finder.isDestroyed) entry.finder.destroy();
  }

  /** Releases everything a session held. Called on `session_shutdown`. */
  releaseAll(consumerId: string): void {
    const held = this.holdings.get(consumerId);
    if (!held) return;
    for (const root of [...held]) this.release(consumerId, root);
  }

  private track(consumerId: string, root: string, entry: RegistryEntry): void {
    entry.consumers.add(consumerId);
    const held = this.holdings.get(consumerId) ?? new Set<string>();
    held.add(root);
    this.holdings.set(consumerId, held);
    this.entries.set(root, entry);
  }

  private async create(root: string): Promise<RegistryEntry> {
    const sdk = await loadFinderSdk();
    if (!sdk.ok) throw new FinderUnavailableError(sdk.error);

    const finder = this.open(sdk.FileFinder, root);
    // `waitForScan` also resolves on timeout, so this bounds start-up rather
    // than guaranteeing a complete index. A partially scanned finder still
    // answers searches, and the watcher fills the rest in.
    await finder.waitForScan(this.options.scanTimeoutMs ?? SCAN_TIMEOUT_MS);
    return { root, finder, consumers: new Set<string>() };
  }

  private open(FileFinder: FileFinderStatic, root: string): FileFinderApi {
    // `aiMode` turns on the engine's agent-oriented ranking. Home and
    // filesystem-root scanning stay off: a session root is always a workspace
    // or worktree, and the confinement policy rejects anything above it.
    const base: InitOptions = { basePath: root, aiMode: true };
    if (this.dbDisabled) return this.unwrap(FileFinder.create(base), root);

    const dbPaths = this.options.dbPaths ?? resolveDbPaths();
    const withDb = FileFinder.create({
      ...base,
      frecencyDbPath: dbPaths.frecency,
      historyDbPath: dbPaths.history,
    });
    if (withDb.ok) return withDb.value;

    // A database failure is usually a stale lock and self-heals on restart.
    // Losing frecency ranking is far better than losing search entirely.
    const dbLess = FileFinder.create(base);
    if (!dbLess.ok) throw new FinderUnavailableError(withDb.error);

    this.dbDisabled = true;
    this.options.onDbFailure?.(withDb.error);
    return dbLess.value;
  }

  private unwrap(result: ReturnType<FileFinderStatic['create']>, root: string): FileFinderApi {
    if (!result.ok) {
      throw new FinderUnavailableError(`Failed to index ${root}: ${result.error}`);
    }
    return result.value;
  }
}
