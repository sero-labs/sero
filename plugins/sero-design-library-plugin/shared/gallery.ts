import type { AppliedGuardrails, DesignBrief, OutputTarget } from './design';
import { normalizeDesignBrief } from './design-normalize';
import type { ModelSelection } from './settings';
import type { MediaProvenance, StoredMediaRequest } from './media';
import { isMediaCapability, normalizeProvenance } from './media';
import { isSafeId } from './paths';
import type { TombstonedProvenance } from './records';
import type { TweakManifest, TweakOverrides } from './tweaks';
import { normalizeTweakManifest, normalizeTweakOverrides } from './tweaks';

export const GALLERY_SCHEMA_VERSION = 1;

export interface GalleryVersionPointer {
  id: string;
  createdAt: number;
  title: string;
  target: OutputTarget;
  sourceVariantId: string;
  sourceRevisionId: string;
  previewFile: string;
  deletedAt?: number;
}

/** Mutable family record. Immutable version records live below `versions/`. */
export interface GalleryFamilyRecord {
  id: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  title: string;
  sourceDesignId: string;
  featuredVersionId: string;
  versions: GalleryVersionPointer[];
  favourite: boolean;
  deletedAt?: number;
}

export interface GallerySnapshotFile {
  name: string;
  bytes: number;
  checksum: string;
}

export interface GallerySnapshotAsset {
  id: string;
  reference: string;
  file: string;
  mediaType: string;
  bytes: number;
  checksum: string;
  request: StoredMediaRequest;
  provenance?: MediaProvenance;
}

export interface GalleryReferenceSnapshot {
  itemId: string;
  order: number;
  title: string;
  tombstone?: TombstonedProvenance;
}

/** Written once with its source tree, assets and preview, then never changed. */
export interface GalleryVersionRecord {
  id: string;
  schemaVersion: number;
  familyId: string;
  createdAt: number;
  title: string;
  name: string;
  summary: string;
  target: OutputTarget;
  sourceDesignId: string;
  sourceVariantId: string;
  sourceRevisionId: string;
  sourceJobId: string;
  model?: ModelSelection;
  files: GallerySnapshotFile[];
  assets: GallerySnapshotAsset[];
  previewFile: string;
  previewBytes: number;
  previewChecksum: string;
  brief: DesignBrief;
  guardrails: AppliedGuardrails;
  references: GalleryReferenceSnapshot[];
  tweakManifest?: TweakManifest;
  effectiveTweaksFile?: string;
  tweakOverrides: TweakOverrides;
  effectiveTweakValues: Record<string, string>;
  dependencyManifest: string[];
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function pointer(value: unknown): GalleryVersionPointer | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string' || !isSafeId(entry.id)) return null;
  if (typeof entry.sourceVariantId !== 'string' || typeof entry.sourceRevisionId !== 'string') return null;
  if (!isSafeId(entry.sourceVariantId) || !isSafeId(entry.sourceRevisionId)) return null;
  if (typeof entry.previewFile !== 'string' || !isSafeId(entry.previewFile)) return null;
  return {
    id: entry.id,
    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
    title: typeof entry.title === 'string' ? entry.title : 'Untitled version',
    target: entry.target === 'html' ? 'html' : 'react',
    sourceVariantId: entry.sourceVariantId,
    sourceRevisionId: entry.sourceRevisionId,
    previewFile: entry.previewFile,
    ...(typeof entry.deletedAt === 'number' ? { deletedAt: entry.deletedAt } : {}),
  };
}

export function normalizeGalleryFamily(value: unknown): GalleryFamilyRecord | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string' || !isSafeId(entry.id)) return null;
  if (typeof entry.sourceDesignId !== 'string' || !isSafeId(entry.sourceDesignId)) return null;
  const versions = Array.isArray(entry.versions)
    ? entry.versions.flatMap((value) => {
        const normalized = pointer(value);
        return normalized ? [normalized] : [];
      })
    : [];
  if (versions.length === 0) return null;
  const featured = typeof entry.featuredVersionId === 'string' &&
    versions.some((version) => version.id === entry.featuredVersionId)
    ? entry.featuredVersionId
    : versions.at(-1)!.id;
  return {
    id: entry.id,
    schemaVersion: typeof entry.schemaVersion === 'number'
      ? entry.schemaVersion
      : GALLERY_SCHEMA_VERSION,
    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
    updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    title: typeof entry.title === 'string' ? entry.title : 'Untitled family',
    sourceDesignId: entry.sourceDesignId,
    featuredVersionId: featured,
    versions,
    favourite: entry.favourite === true,
    ...(typeof entry.deletedAt === 'number' ? { deletedAt: entry.deletedAt } : {}),
  };
}

export function normalizeGalleryVersion(value: unknown): GalleryVersionRecord | null {
  const entry = object(value);
  if (!entry) return null;
  if (typeof entry.id !== 'string' || !isSafeId(entry.id)) return null;
  if (typeof entry.familyId !== 'string' || !isSafeId(entry.familyId)) return null;
  if (typeof entry.sourceDesignId !== 'string' || !isSafeId(entry.sourceDesignId)) return null;
  if (typeof entry.sourceVariantId !== 'string' || !isSafeId(entry.sourceVariantId)) return null;
  if (typeof entry.sourceRevisionId !== 'string' || !isSafeId(entry.sourceRevisionId)) return null;
  if (typeof entry.sourceJobId !== 'string' || !isSafeId(entry.sourceJobId)) return null;
  if (typeof entry.previewFile !== 'string' || !isSafeId(entry.previewFile)) return null;
  const files = normalizeFiles(entry.files);
  const assets = normalizeAssets(entry.assets);
  const references = normalizeReferences(entry.references);
  if (!files || !assets || !references) return null;
  const guardrails = normalizeGuardrails(entry.guardrails);
  const effectiveTweakValues = normalizeStringRecord(entry.effectiveTweakValues);
  const manifest = entry.tweakManifest === undefined
    ? undefined
    : normalizeTweakManifest(entry.tweakManifest);
  const effectiveTweaksFile = typeof entry.effectiveTweaksFile === 'string' &&
    isSafeId(entry.effectiveTweaksFile)
    ? entry.effectiveTweaksFile
    : undefined;
  const model = object(entry.model);
  return {
    id: entry.id,
    schemaVersion: number(entry.schemaVersion) || GALLERY_SCHEMA_VERSION,
    familyId: entry.familyId,
    createdAt: number(entry.createdAt),
    title: typeof entry.title === 'string' ? entry.title : 'Untitled Design',
    name: typeof entry.name === 'string' ? entry.name : '',
    summary: typeof entry.summary === 'string' ? entry.summary : '',
    target: entry.target === 'html' ? 'html' : 'react',
    sourceDesignId: entry.sourceDesignId,
    sourceVariantId: entry.sourceVariantId,
    sourceRevisionId: entry.sourceRevisionId,
    sourceJobId: entry.sourceJobId,
    ...(model && typeof model.providerId === 'string' && typeof model.modelId === 'string'
      ? { model: { providerId: model.providerId, modelId: model.modelId } }
      : {}),
    files,
    assets,
    previewFile: entry.previewFile,
    previewBytes: number(entry.previewBytes),
    previewChecksum: typeof entry.previewChecksum === 'string' ? entry.previewChecksum : '',
    brief: normalizeDesignBrief(entry.brief),
    guardrails,
    references,
    ...(manifest === undefined ? {} : { tweakManifest: manifest }),
    ...(effectiveTweaksFile === undefined ? {} : { effectiveTweaksFile }),
    tweakOverrides: normalizeTweakOverrides(entry.tweakOverrides),
    effectiveTweakValues,
    dependencyManifest: strings(entry.dependencyManifest),
  };
}

function normalizeFiles(value: unknown): GallerySnapshotFile[] | null {
  if (!Array.isArray(value)) return null;
  const files = value.flatMap((candidate) => {
    const file = object(candidate);
    if (!file || typeof file.name !== 'string' || !isSafeId(file.name)) return [];
    if (typeof file.checksum !== 'string') return [];
    return [{ name: file.name, bytes: number(file.bytes), checksum: file.checksum }];
  });
  return files.length === value.length && files.length > 0 ? files : null;
}

function normalizeRequest(value: unknown): StoredMediaRequest | null {
  const request = object(value);
  if (!request || !isMediaCapability(request.capability)) return null;
  return {
    capability: request.capability,
    prompt: typeof request.prompt === 'string' ? request.prompt : '',
    ...(typeof request.model === 'string' ? { model: request.model } : {}),
    ...(Array.isArray(request.sourceAssetIds)
      ? { sourceAssetIds: strings(request.sourceAssetIds) }
      : {}),
    ...(typeof request.aspectRatio === 'string' ? { aspectRatio: request.aspectRatio } : {}),
    ...(typeof request.seed === 'number' ? { seed: request.seed } : {}),
    ...(typeof request.durationSeconds === 'number'
      ? { durationSeconds: request.durationSeconds }
      : {}),
  };
}

function normalizeAssets(value: unknown): GallerySnapshotAsset[] | null {
  if (!Array.isArray(value)) return null;
  const assets = value.flatMap((candidate) => {
    const asset = object(candidate);
    const request = normalizeRequest(asset?.request);
    if (!asset || !request || typeof asset.id !== 'string' || !isSafeId(asset.id)) return [];
    if (typeof asset.reference !== 'string' || !/^assets\/[A-Za-z0-9._-]+$/.test(asset.reference)) return [];
    if (typeof asset.file !== 'string' || !/^assets\/[A-Za-z0-9._-]+$/.test(asset.file)) return [];
    if (typeof asset.mediaType !== 'string' || typeof asset.checksum !== 'string') return [];
    const provenance = normalizeProvenance(asset.provenance);
    return [{
      id: asset.id,
      reference: asset.reference,
      file: asset.file,
      mediaType: asset.mediaType,
      bytes: number(asset.bytes),
      checksum: asset.checksum,
      request,
      ...(provenance === undefined ? {} : { provenance }),
    }];
  });
  return assets.length === value.length ? assets : null;
}

function normalizeReferences(value: unknown): GalleryReferenceSnapshot[] | null {
  if (!Array.isArray(value)) return null;
  const references = value.flatMap((candidate) => {
    const reference = object(candidate);
    if (!reference || typeof reference.itemId !== 'string' || !isSafeId(reference.itemId)) return [];
    const tombstone = object(reference.tombstone);
    return [{
      itemId: reference.itemId,
      order: number(reference.order),
      title: typeof reference.title === 'string' ? reference.title : reference.itemId,
      ...(tombstone && typeof tombstone.itemId === 'string'
        ? {
            tombstone: {
              itemId: tombstone.itemId,
              title: typeof tombstone.title === 'string' ? tombstone.title : 'Deleted reference',
              ...(typeof tombstone.primaryStyle === 'string'
                ? { primaryStyle: tombstone.primaryStyle }
                : {}),
              deletedAt: number(tombstone.deletedAt),
            },
          }
        : {}),
    }];
  });
  return references.length === value.length && references.length > 0 ? references : null;
}

function normalizeGuardrails(value: unknown): AppliedGuardrails {
  const guardrails = object(value);
  const resolved = Array.isArray(guardrails?.resolved)
    ? guardrails.resolved.flatMap((candidate) => {
        const conflict = object(candidate);
        if (!conflict || typeof conflict.rule !== 'string' || typeof conflict.keptFromItemId !== 'string') return [];
        return [{
          rule: conflict.rule,
          keptFromItemId: conflict.keptFromItemId,
          droppedFromItemIds: strings(conflict.droppedFromItemIds),
        }];
      })
    : [];
  return {
    always: strings(guardrails?.always),
    never: strings(guardrails?.never),
    session: strings(guardrails?.session),
    resolved,
  };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = object(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}
