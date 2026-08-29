/**
 * Per-session view of the shared index.
 *
 * Each loaded extension instance owns one of these. It resolves the session's
 * effective root from the Pi context, acquires the shared finder for that root,
 * and turns every failure below it into the same actionable message: the agent
 * is told to fall back to `bash` with `rg` rather than being left with a tool
 * that silently returns nothing.
 */

import { randomUUID } from 'node:crypto';

import type { FileFinderApi } from '@ff-labs/fff-node';

import { canonicalRoot, isIndexableRoot } from './path-policy';
import { FinderRegistry } from './registry';

export const FALLBACK_HINT =
  'Fall back to `bash` with `rg` (for example `rg -n "pattern" path/`) for this search.';

export class SearchUnavailableError extends Error {
  constructor(reason: string) {
    super(`FFF search index unavailable: ${reason}. ${FALLBACK_HINT}`);
    this.name = 'SearchUnavailableError';
  }
}

const SHARED_REGISTRY_KEY = Symbol.for('@sero-ai/plugin-fff/shared-finder-registry');

type FffGlobalState = typeof globalThis & {
  [SHARED_REGISTRY_KEY]?: FinderRegistry;
};

const globalState = globalThis as FffGlobalState;

/**
 * Pi can re-evaluate this module when its single-cwd extension cache changes.
 * Store the registry on the process global so those module instances still
 * share one finder per canonical root.
 */
export const sharedRegistry = globalState[SHARED_REGISTRY_KEY] ??= new FinderRegistry({
  onDbFailure: (error) =>
    console.warn(
      `[sero-fff] frecency/history database unavailable (${error}); `
      + 'continuing without frecency ranking.',
    ),
});

export class SearchContext {
  /** Identifies this session inside the shared registry's reference counts. */
  readonly consumerId: string;

  private root: string | null = null;

  private released = false;

  constructor(private readonly registry: FinderRegistry = sharedRegistry) {
    this.consumerId = `sero-fff-${process.pid}-${randomUUID()}`;
  }

  /**
   * Records the session's root. Called on `session_start` and again from each
   * tool call, because a tool can run in a context whose cwd differs from the
   * one the session started in.
   */
  setRoot(cwd: string): string {
    const canonical = canonicalRoot(cwd);
    if (this.root && this.root !== canonical) {
      this.registry.release(this.consumerId, this.root);
    }
    this.root = canonical;
    return canonical;
  }

  /** The current root, or `null` before the first `setRoot`. */
  currentRoot(): string | null {
    return this.root;
  }

  /** Acquires (creating if needed) the shared finder for `cwd`. */
  async finderFor(cwd: string): Promise<{ finder: FileFinderApi; root: string }> {
    if (this.released) throw new SearchUnavailableError('search session is closed');
    const root = this.setRoot(cwd);
    if (!isIndexableRoot(root)) {
      throw new SearchUnavailableError(`${root} is not a workspace root, so it is not indexed`);
    }
    try {
      const finder = await this.registry.acquire({ root, consumerId: this.consumerId });
      return { finder, root };
    } catch (error) {
      throw new SearchUnavailableError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Warms the index at session start. Failures are swallowed on purpose: an
   * index that cannot be built must never stop a session from opening.
   */
  async warm(cwd: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.finderFor(cwd);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  release(): void {
    this.released = true;
    this.registry.releaseAll(this.consumerId);
    this.root = null;
  }
}
