import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import { pendingRequests, readState } from '../shared/state-io';
import { pruneStaleUploads } from '../shared/uploads';
import { Coordinator } from './coordinator';
import { pruneOrphanRevisions, scanDesigns } from './design-store';
import { reindex } from './store';
import { pruneGalleryTemps, reindexGallery } from './gallery-store';
import { pruneStaging } from '../sprite-studio/runtime/staging';
import { projectSpriteState } from '../sprite-studio/runtime/projection';
import { recoverUnfinishedAnimations } from '../sprite-studio/runtime/recover';

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
    // Pruning runs before the coordinator drains, so it is told which uploads
    // a queued import is still waiting on. Without that, closing the app
    // between completing an upload and importing it loses the file.
    await this.attempt('prune stale uploads', async () => {
      const state = await readState(paths);
      const awaited = new Set(
        pendingRequests(state).flatMap((request) =>
          request.body.kind === 'ingest'
            ? [request.body.uploadId]
            : request.body.kind === 'gallery.save'
              ? [request.body.previewUploadId]
              : [],
        ),
      );
      return pruneStaleUploads(paths, STALE_UPLOAD_MS, Date.now(), awaited);
    });

    // Rebuild the index from the records: an index write interrupted by a
    // crash is a cache miss, not data loss, and this is where it heals.
    const unreadable = await this.attempt('rebuild the index', () => reindex(paths));
    if (unreadable !== undefined && unreadable.length > 0) {
      this.report(
        `Skipped ${unreadable.length} record(s) this version cannot read (${unreadable.join(', ')}). ` +
          'Their files are untouched under items/ and designs/.',
        null,
      );
    }
    await this.attempt('rebuild the Gallery index', () => reindexGallery(paths));
    await this.attempt('remove incomplete Gallery snapshots', () => pruneGalleryTemps(paths));

    // A revision's files are written before the record entry naming them, so a
    // crash in between leaves a directory nothing points at. The variant is
    // regenerated from scratch, which makes those files dead weight.
    await this.attempt('remove orphaned revision files', async () => {
      const { designs } = await scanDesigns(paths);
      for (const design of designs) await pruneOrphanRevisions(paths, design);
    });

    // Before the projection, because it changes what the projection will say:
    // the queue is in memory, so an animation whose job was running when the
    // app closed has a status nothing is working on any more.
    await this.attempt('settle unfinished animations', () =>
      recoverUnfinishedAnimations(paths),
    );

    // Sprite Studio's projection is rebuilt at start-up for the same reason the
    // Library's index is: a projection write interrupted by a crash is a cache
    // miss, and this is where it heals.
    await this.attempt('rebuild the Sprite Studio index', () => projectSpriteState(paths));

    // Frames a page pushed across and then never sent a request for — the app
    // was closed mid-upload — are worth nothing to anyone.
    await this.attempt('remove abandoned sprite staging', async () => {
      const state = await readState(paths);
      const awaited = new Set(
        pendingRequests(state).flatMap((request) =>
          'stagingKey' in request.body ? [request.body.stagingKey] : [],
        ),
      );
      return pruneStaging(paths, STALE_UPLOAD_MS, Date.now(), awaited);
    });

    this.coordinator = new Coordinator({
      host: this.ctx.host,
      paths,
      workspaceId: this.ctx.workspaceId,
      workspacePath: this.ctx.workspacePath,
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
