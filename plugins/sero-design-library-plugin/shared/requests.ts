/**
 * The intent contract between extension tools and the background runtime.
 *
 * Tools never mutate a domain record. They append one of these requests to the
 * reactive index; the runtime is the single writer that applies it. Requests
 * are append-only and consumed by a monotonic watermark, so an append that
 * races a consume can never be dropped.
 */

import type { EntityId, LibrarianField, OutputTarget, RevisionBehaviour } from './types';
import type { TweakCheckpointReason, TweakValue } from './tweak-types';

export interface RequestMap {
  'item.ingest-upload': { uploadId: string; source: string; fileName: string };
  'item.update-field': { itemId: EntityId; field: LibrarianField; value: unknown };
  'item.reset-field': { itemId: EntityId; field: LibrarianField };
  'item.soft-delete': { itemId: EntityId };
  'item.restore': { itemId: EntityId };
  'item.purge': { itemId: EntityId };
  'analysis.run': { itemId: EntityId; reanalyse: boolean };
  'analysis.cancel': { itemId: EntityId };
  'design.create': {
    designId: EntityId;
    title: string;
    request: string;
    outputTarget: OutputTarget;
    itemIds: EntityId[];
  };
  'design.generate': { designId: EntityId; variantCount: number };
  'design.resolve-conflict': {
    designId: EntityId;
    always: string;
    never: string;
    resolution: 'keep-always' | 'keep-never';
  };
  'design.revise': {
    designId: EntityId;
    variantId: EntityId;
    instruction: string;
    behaviour: RevisionBehaviour;
  };
  'design.retry-variant': { designId: EntityId; variantId: EntityId };
  'design.cancel-variant': { designId: EntityId; variantId: EntityId };
  'design.delete': { designId: EntityId };
  'design.restore': { designId: EntityId };
  'tweak.update': {
    designId: EntityId;
    variantId: EntityId;
    overrides: Record<string, TweakValue>;
  };
  'tweak.reset': { designId: EntityId; variantId: EntityId; controlId?: string };
  'tweak.checkpoint': { designId: EntityId; variantId: EntityId; reason: TweakCheckpointReason };
  'design-asset.retry': { designId: EntityId; assetId: EntityId };
  'design-asset.delete': { designId: EntityId; assetId: EntityId };
  'design-asset.promote': { designId: EntityId; assetId: EntityId };
  'gallery.save': { designId: EntityId; variantId: EntityId; familyId?: EntityId };
  'gallery.feature': { familyId: EntityId; versionId: EntityId };
  'gallery.reopen': { familyId: EntityId; versionId: EntityId; designId: EntityId };
  'gallery.duplicate': { familyId: EntityId; versionId: EntityId; newFamilyId: EntityId };
  'gallery.remix': {
    familyId: EntityId;
    versionId: EntityId;
    newFamilyId: EntityId;
    designId: EntityId;
    request: string;
  };
  'gallery.delete': { familyId: EntityId; versionId?: EntityId };
  'gallery.restore': { familyId: EntityId; versionId?: EntityId };
  'gallery.purge': { familyId: EntityId; versionId?: EntityId };
  'export.version': {
    familyId: EntityId;
    versionId: EntityId;
    destination: 'downloads' | 'workspace';
    workspacePath?: string;
  };
  'settings.update': { variantCount?: number; revisionBehaviour?: RevisionBehaviour };
  'notice.dismiss': { noticeId: EntityId };
}

export type RequestAction = keyof RequestMap;

export const REQUEST_ACTIONS = [
  'item.ingest-upload',
  'item.update-field',
  'item.reset-field',
  'item.soft-delete',
  'item.restore',
  'item.purge',
  'analysis.run',
  'analysis.cancel',
  'design.create',
  'design.generate',
  'design.resolve-conflict',
  'design.revise',
  'design.retry-variant',
  'design.cancel-variant',
  'design.delete',
  'design.restore',
  'tweak.update',
  'tweak.reset',
  'tweak.checkpoint',
  'design-asset.retry',
  'design-asset.delete',
  'design-asset.promote',
  'gallery.save',
  'gallery.feature',
  'gallery.reopen',
  'gallery.duplicate',
  'gallery.remix',
  'gallery.delete',
  'gallery.restore',
  'gallery.purge',
  'export.version',
  'settings.update',
  'notice.dismiss',
] as const satisfies readonly RequestAction[];

export function isRequestAction(value: string): value is RequestAction {
  return (REQUEST_ACTIONS as readonly string[]).includes(value);
}
