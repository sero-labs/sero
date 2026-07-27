/**
 * Intent submitted by extension tools and consumed by the background runtime.
 *
 * Extension tools never write records. They append a request to reactive state
 * and return; the runtime is the single authoritative writer (spec §12). The
 * request log is append-only and consumed by a monotonic watermark, so a
 * request is never applied twice and a crash between append and apply loses
 * nothing.
 */

import type { DesignBrief } from './design';
import type { LibrarianField, LibrarianUserFacingAnalysis } from './librarian';
import type { DesignLibrarySettings } from './settings';
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
    }
  | { kind: 'design.rename'; designId: string; title: string }
  | { kind: 'design.retry-variant'; designId: string; variantId: string }
  | { kind: 'design.cancel-variant'; designId: string; variantId: string }
  | { kind: 'design.delete'; designId: string }
  | { kind: 'design.restore'; designId: string }
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
