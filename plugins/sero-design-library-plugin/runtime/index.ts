import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import { pruneStaleUploads } from '../shared/uploads';
import { Coordinator } from './coordinator';
import { reindex } from './store';

/**
 * The Design Library background runtime — the single authoritative writer.
 *
 * It owns every record mutation. Extension tools submit intent into reactive
 * state and this runtime applies it, which is what keeps two processes from
 * writing the same record and what lets analysis keep running while the
 * plugin's UI is closed.
 */

/** An upload with no activity for this long was abandoned by its uploader. */
const STALE_UPLOAD_MS = 60 * 60 * 1000;

class DesignLibraryRuntime implements AppRuntime {
  private coordinator: Coordinator | null = null;
  private paths: DesignLibraryPaths | null = null;

  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    // A global app's state file already sits in the profile-global app
    // directory, so its parent is the plugin's storage root.
    const { path: home } = await this.ctx.host.appState.globalDir(this.ctx.appId);
    const paths = designLibraryPathsFromHome(home);
    this.paths = paths;

    // Housekeeping must never decide whether the plugin runs. A runtime that
    // fails to start consumes no requests at all, so the UI goes quietly dead
    // — every button appears to do nothing. Startup chores are therefore
    // best-effort, and the coordinator is created either way.
    await this.attempt('prune stale uploads', () => pruneStaleUploads(paths, STALE_UPLOAD_MS));

    // Rebuild the index from the records: an index write interrupted by a
    // crash is a cache miss, not data loss, and this is where it heals.
    const unreadable = await this.attempt('rebuild the index', () => reindex(paths));
    if (unreadable !== undefined && unreadable.length > 0) {
      this.report(
        `Skipped ${unreadable.length} record(s) this version cannot read (${unreadable.join(', ')}). ` +
          'Their files are untouched under items/.',
        null,
      );
    }

    this.coordinator = new Coordinator({
      host: this.ctx.host,
      paths,
      workspaceId: this.ctx.workspaceId,
      sessionId: `design-library-${this.ctx.workspaceId}`,
      onError: (message, error) => this.report(message, error),
    });
    await this.coordinator.start();
  }

  /** Run a startup chore, reporting failure instead of aborting the start. */
  private async attempt<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (error) {
      this.report(`Could not ${what}`, error);
      return undefined;
    }
  }

  async handleStateChange(): Promise<void> {
    // Any state write may have appended intent; the coordinator decides
    // whether there is actually anything new to apply.
    await this.coordinator?.drain();
  }

  async dispose(): Promise<void> {
    await this.coordinator?.dispose();
    this.coordinator = null;
    this.paths = null;
  }

  private report(message: string, error: unknown): void {
    if (error === null) {
      console.warn(`[design-library] ${message}`);
      return;
    }
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[design-library] ${message}: ${detail}`);
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new DesignLibraryRuntime(ctx);
}

export default { createAppRuntime } satisfies AppRuntimeModule;
