/**
 * Intent submitted by extension tools and consumed by the background runtime.
 *
 * Extension tools never write records. They append a request to reactive state
 * and return; the runtime is the single authoritative writer (spec §12). The
 * request log is append-only and consumed by a monotonic watermark, so a
 * request is never applied twice and a crash between append and apply loses
 * nothing.
 */

import type { DesignBrief, DesignRecord } from './design';
import type { ExportDestination } from './export';
import type { LibrarianField, LibrarianUserFacingAnalysis } from './librarian';
import type { MediaCapability, StoredMediaRequest } from './media';
import type { DesignLibrarySettings, RevisionBehaviour } from './settings';
import type { ConflictResolution } from './synthesis';
import type { ViewPatch } from './types';

export type LibraryRequestBody =
  /** An upload finished assembling; turn it into a Library item. */
  | { kind: 'ingest'; uploadId: string }
  | { kind: 'item.set-field'; itemId: string; field: LibrarianField; value: LibrarianUserFacingAnalysis[LibrarianField] }
  | { kind: 'item.reset-field'; itemId: string; field: LibrarianField }
  | { kind: 'item.favourite'; itemId: string; favourite: boolean }
  | { kind: 'item.collect'; itemId: string; collectionId: string; member: boolean }
  | { kind: 'item.delete'; itemId: string }
  | { kind: 'item.restore'; itemId: string }
  | { kind: 'item.purge'; itemId: string }
  | { kind: 'analysis.run'; itemId: string; force: boolean }
  | { kind: 'analysis.cancel'; itemId: string }
  | { kind: 'collection.create'; collectionId: string; name: string; colour: string }
  | { kind: 'collection.rename'; collectionId: string; name: string }
  | { kind: 'collection.delete'; collectionId: string }
  /**
   * Start a Design. The runtime re-derives the guardrail synthesis from the
   * reference records and applies these resolutions itself — the caller's view
   * of the conflicts is never taken as settled, because a reference's guardrails
   * may have been edited between the dialog opening and this request landing.
   */
  | {
      kind: 'design.create';
      designId: string;
      title: string;
      brief: DesignBrief;
      /** Ordered; position 0 is primary (spec §6.1). */
      referenceItemIds: string[];
      resolutions: ConflictResolution[];
      /** Rules the user set for this Design alone (spec §6.2). */
      sessionRules: string[];
      galleryFamilyId?: string;
      galleryLineage?: NonNullable<DesignRecord['galleryLineage']>;
    }
  | { kind: 'design.rename'; designId: string; title: string }
  | { kind: 'design.retry-variant'; designId: string; variantId: string }
  | { kind: 'design.cancel-variant'; designId: string; variantId: string }
  | { kind: 'design.delete'; designId: string }
  | { kind: 'design.restore'; designId: string }
  /**
   * Another run on a variant that already has a result, carrying what to change
   * (spec §6.4). `behaviour` decides what happens to the revision it started
   * from: `replace` retires it into history, `retain` keeps it in the selector.
   */
  | {
      kind: 'design.revise-variant';
      designId: string;
      variantId: string;
      instruction: string;
      behaviour: RevisionBehaviour;
    }
  | { kind: 'design.set-visible-revision'; designId: string; variantId: string; revisionId: string }
  | { kind: 'design.delete-revision'; designId: string; variantId: string; revisionId: string }
  /**
   * Tweak values, addressed by revision because a manifest belongs to one
   * (spec §6.5). The value travels as a string and is coerced onto the control
   * the manifest declares; the runtime refuses anything that control does not
   * accept, so a request naming a stale control is a no-op rather than a write.
   */
  | { kind: 'design.set-tweak'; designId: string; variantId: string; revisionId: string; controlId: string; value: string }
  | { kind: 'design.reset-tweak'; designId: string; variantId: string; revisionId: string; controlId: string }
  | { kind: 'design.reset-tweaks'; designId: string; variantId: string; revisionId: string }
  /** End an editing session: one recoverable entry, however many changes it held. */
  | { kind: 'design.checkpoint-tweaks'; designId: string; variantId: string; revisionId: string }
  | { kind: 'design.restore-tweaks'; designId: string; variantId: string; revisionId: string; checkpointId: string }
  /**
   * Generate one asset into a Design's tray (spec §6.6, D5).
   *
   * The asset id is allocated by the caller, as a Design's is: the request log
   * is applied at-least-once, and an id chosen by the handler would make a
   * replay produce a second asset — and a second provider call to fill it.
   */
  | { kind: 'media.generate'; designId: string; assetId: string; request: StoredMediaRequest }
  /** Try again for one asset, keeping its id, its reference and its history. */
  | { kind: 'media.retry'; designId: string; assetId: string }
  | { kind: 'media.delete'; designId: string; assetId: string; deleted: boolean }
  | { kind: 'media.purge'; designId: string; assetId: string }
  /** Make an independent Library item from a tray asset (spec §6.6). */
  | { kind: 'media.copy-to-library'; designId: string; assetId: string }
  | {
      kind: 'gallery.save';
      familyId: string;
      versionId: string;
      designId: string;
      variantId: string;
      revisionId: string;
      previewUploadId: string;
    }
  | { kind: 'gallery.feature'; familyId: string; versionId: string }
  | { kind: 'gallery.favourite'; familyId: string; favourite: boolean }
  | { kind: 'gallery.open'; familyId: string; versionId: string }
  | {
      kind: 'gallery.duplicate';
      familyId: string;
      versionId: string;
      designId: string;
      newFamilyId: string;
      variantId: string;
      revisionId: string;
    }
  | { kind: 'gallery.delete-version'; familyId: string; versionId: string; deleted: boolean }
  | { kind: 'gallery.purge-version'; familyId: string; versionId: string }
  | { kind: 'gallery.delete-family'; familyId: string; deleted: boolean }
  | { kind: 'gallery.purge-family'; familyId: string }
  | {
      kind: 'export.run';
      exportId: string;
      familyId: string;
      versionId: string;
      destination: ExportDestination;
      workspacePath?: string;
    }
  /**
   * Generate straight into the Library — Generate inspiration, or Restyle/vary
   * when `sourceItemId` is set (D3). `slotId` is what the grid renders a pending
   * tile against, and what makes a replayed request find its own job.
   */
  | {
      kind: 'library.generate';
      slotId: string;
      capability: MediaCapability;
      prompt: string;
      sourceItemId?: string;
      aspectRatio?: string;
      seed?: number;
      durationSeconds?: number;
    }
  /**
   * Forget a job that has finished, so the surface it is showing on can stop
   * showing it. A job still running is left alone — cancelling is `*.cancel`.
   */
  | { kind: 'job.dismiss'; jobId: string }
  /**
   * Frames the renderer captured from a generated video (D4).
   *
   * Video is decoded in the renderer — the runtime has no image library and no
   * codecs — so a clip finishes with no thumbnail and nothing the Librarian can
   * look at. The open app extracts a poster and a filmstrip, uploads them, and
   * this attaches them to whatever they belong to.
   */
  | {
      kind: 'frames.attach';
      uploadId: string;
      target:
        | { kind: 'item'; itemId: string }
        /**
         * `attemptId` is what the frames were captured *from*. A capture takes
         * seconds, and a retry inside that window produces different footage —
         * without it the poster from the old clip would be attached to the new
         * one, which is worse than having no poster at all.
         */
        | { kind: 'asset'; designId: string; assetId: string; attemptId: string };
    }
  | { kind: 'settings.update'; patch: Partial<DesignLibrarySettings> }
  /**
   * Search, filter and page preferences. The UI holds these locally for
   * responsiveness and persists them through the same single-writer path as
   * everything else, rather than writing state behind the runtime's back.
   */
  | { kind: 'view.set'; patch: ViewPatch };

export interface LibraryRequest {
  id: number;
  requestedAt: number;
  body: LibraryRequestBody;
}

export type LibraryRequestKind = LibraryRequestBody['kind'];

const REQUEST_KINDS: readonly LibraryRequestKind[] = [
  'ingest',
  'item.set-field',
  'item.reset-field',
  'item.favourite',
  'item.collect',
  'item.delete',
  'item.restore',
  'item.purge',
  'analysis.run',
  'analysis.cancel',
  'collection.create',
  'collection.rename',
  'collection.delete',
  'design.create',
  'design.rename',
  'design.retry-variant',
  'design.cancel-variant',
  'design.delete',
  'design.restore',
  'design.revise-variant',
  'design.set-visible-revision',
  'design.delete-revision',
  'design.set-tweak',
  'design.reset-tweak',
  'design.reset-tweaks',
  'design.checkpoint-tweaks',
  'design.restore-tweaks',
  'media.generate',
  'media.retry',
  'media.delete',
  'media.purge',
  'media.copy-to-library',
  'gallery.save',
  'gallery.feature',
  'gallery.favourite',
  'gallery.open',
  'gallery.duplicate',
  'gallery.delete-version',
  'gallery.purge-version',
  'gallery.delete-family',
  'gallery.purge-family',
  'export.run',
  'library.generate',
  'job.dismiss',
  'frames.attach',
  'settings.update',
  'view.set',
] as const;

export function isLibraryRequestKind(value: unknown): value is LibraryRequestKind {
  return typeof value === 'string' && (REQUEST_KINDS as readonly string[]).includes(value);
}

export function isLibraryRequest(value: unknown): value is LibraryRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'number' || typeof candidate.requestedAt !== 'number') return false;
  const body = candidate.body;
  if (typeof body !== 'object' || body === null) return false;
  return isLibraryRequestKind((body as Record<string, unknown>).kind);
}
