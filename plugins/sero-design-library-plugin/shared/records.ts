/**
 * Plugin-owned records. These live in files under the global app state
 * directory, never in reactive state — reactive state carries only the
 * lightweight summaries projected from them (spec §12).
 */

import type { EditableLibrarianProfile } from './librarian';
import { normalizeAnalysis, normalizeOverrides } from './librarian';
import type { MediaCapability, MediaProvenance } from './media';
import { isMediaCapability, normalizeProvenance } from './media';
import { isSafeId } from './paths';

export type MediaKind = 'image' | 'video';

export type AnalysisStatus = 'pending' | 'running' | 'ready' | 'failed' | 'cancelled';

export type ItemSourceKind = 'file' | 'drop' | 'paste' | 'generated' | 'derived';

export interface ItemSource {
  kind: ItemSourceKind;
  /** Original file name, when one was supplied. Display only. */
  fileName?: string;
  /** For `derived` items: the Library item this one was made from. */
  parentItemId?: string;
}

export interface ItemAsset {
  /** File name inside the item directory, e.g. `original.png`. */
  originalFile: string;
  /** File name inside the item directory, e.g. `preview.webp`. */
  previewFile: string;
  /**
   * A video's filmstrip — several moments side by side in one image (D4).
   *
   * What the Librarian is shown for a video, because it cannot watch one. Absent
   * for images, and absent for a video whose frames have not been captured yet.
   */
  framesFile?: string;
  mediaType: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** SHA-256 of the original bytes. Duplicate detection uses this. */
  checksum: string;
}

export interface ItemAnalysisState {
  status: AnalysisStatus;
  /** The persisted job currently responsible for this item's analysis. */
  jobId?: string;
  error?: string;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Identity a dependant keeps after its source is permanently deleted. It
 * explains what is missing without retaining the deleted asset (spec §4).
 */
export interface TombstonedProvenance {
  itemId: string;
  title: string;
  primaryStyle?: string;
  deletedAt: number;
}

export interface ItemRecord {
  id: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  kind: MediaKind;
  source: ItemSource;
  asset: ItemAsset;
  profile: EditableLibrarianProfile;
  analysis: ItemAnalysisState;
  favourite: boolean;
  collectionIds: string[];
  /**
   * How it was generated, when it was (spec §6.6, §8.4).
   *
   * Present on an item that came from Generate inspiration, Restyle/vary or
   * Copy to Library, and absent on one that was imported. Kept on the item
   * rather than derived from its source, because Copy to Library makes an
   * *independent* item — the Design it came from can be deleted and this must
   * still be able to say what produced it.
   */
  generation?: MediaProvenance;
  /**
   * Frames still owed for a generated video (D4, and the UI-decode decision).
   *
   * Video is decoded in the renderer, so a video that finished while the app was
   * closed has no thumbnail and nothing for the Librarian to look at. The flag
   * is what the open UI looks for, and what stops analysis from running on a
   * video it cannot see.
   */
  awaitingFrames?: boolean;
  /** Set by normal deletion; cleared by restore. Absent means live. */
  deletedAt?: number;
}

/** Whether an item's pixels were made inside Design Library. */
export function itemIsPluginArtwork(item: ItemRecord): boolean {
  return item.kind === 'image' &&
    (item.source.kind === 'generated' || item.source.kind === 'derived');
}

export const ITEM_SCHEMA_VERSION = 1;

export interface Collection {
  id: string;
  name: string;
  /** A theme token name, not a raw colour, so collections follow the theme. */
  colour: string;
  createdAt: number;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Validate a record read from disk.
 *
 * Records are files, and files outlive the code that wrote them — a record
 * from an earlier version of the plugin, or a half-written one, is a normal
 * thing to find rather than an impossible one. Returning null lets the caller
 * skip it; the alternative, trusting the parse and dereferencing, takes the
 * whole runtime down over a single unreadable file.
 */
export function normalizeItemRecord(value: unknown): ItemRecord | null {
  if (!isRecordObject(value)) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;

  const asset = value.asset;
  const profile = value.profile;
  const analysis = value.analysis;
  if (!isRecordObject(asset) || !isRecordObject(profile) || !isRecordObject(analysis)) return null;
  if (typeof asset.originalFile !== 'string' || typeof asset.previewFile !== 'string') return null;
  if (typeof asset.checksum !== 'string') return null;
  if (!isRecordObject(profile.generated)) return null;

  const status = analysis.status;
  const known = status === 'pending' || status === 'running' || status === 'ready' ||
    status === 'failed' || status === 'cancelled';
  const generation = normalizeProvenance(value.generation);

  return {
    id: value.id,
    schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : ITEM_SCHEMA_VERSION,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    kind: value.kind === 'video' ? 'video' : 'image',
    source: isRecordObject(value.source)
      ? {
          kind: (value.source.kind as ItemSourceKind) ?? 'file',
          ...(typeof value.source.fileName === 'string' ? { fileName: value.source.fileName } : {}),
          ...(typeof value.source.parentItemId === 'string'
            ? { parentItemId: value.source.parentItemId }
            : {}),
        }
      : { kind: 'file' },
    asset: {
      originalFile: asset.originalFile,
      previewFile: asset.previewFile,
      ...(typeof asset.framesFile === 'string' && asset.framesFile !== ''
        ? { framesFile: asset.framesFile }
        : {}),
      mediaType: typeof asset.mediaType === 'string' ? asset.mediaType : 'application/octet-stream',
      bytes: typeof asset.bytes === 'number' ? asset.bytes : 0,
      ...(typeof asset.width === 'number' ? { width: asset.width } : {}),
      ...(typeof asset.height === 'number' ? { height: asset.height } : {}),
      ...(typeof asset.durationMs === 'number' ? { durationMs: asset.durationMs } : {}),
      checksum: asset.checksum,
    },
    profile: {
      generated: normalizeAnalysis(profile.generated),
      // Overrides are validated on the way in too, but a record on disk may
      // predate that check — so it is enforced again on the way out.
      overrides: normalizeOverrides(profile.overrides),
    },
    analysis: {
      status: known ? status : 'pending',
      ...(typeof analysis.jobId === 'string' ? { jobId: analysis.jobId } : {}),
      ...(typeof analysis.error === 'string' ? { error: analysis.error } : {}),
      attempts: typeof analysis.attempts === 'number' ? analysis.attempts : 0,
      ...(typeof analysis.startedAt === 'number' ? { startedAt: analysis.startedAt } : {}),
      ...(typeof analysis.completedAt === 'number' ? { completedAt: analysis.completedAt } : {}),
    },
    favourite: value.favourite === true,
    collectionIds: stringList(value.collectionIds),
    ...(generation === undefined ? {} : { generation }),
    ...(value.awaitingFrames === true ? { awaitingFrames: true } : {}),
    ...(typeof value.deletedAt === 'number' ? { deletedAt: value.deletedAt } : {}),
  };
}

export type JobKind = 'ingest' | 'analysis' | 'generate' | 'media';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * What a job is responsible for.
 *
 * A discriminated target rather than a bare `itemId`, because a generation job
 * belongs to one variant of one Design and has no item at all. Storing an empty
 * `itemId` for those would let restart recovery hand that empty string to a
 * path helper, and `assertSafeId` would throw part-way through reconciliation —
 * taking the whole recovery pass down with it.
 */
export type JobTarget =
  | { kind: 'item'; itemId: string }
  | { kind: 'variant'; designId: string; variantId: string }
  /** One asset in a Design's tray, generating or being retried (spec §6.6). */
  | { kind: 'asset'; designId: string; assetId: string }
  /**
   * A Library generation with nothing to point at yet.
   *
   * Generate inspiration produces an item that does not exist until the bytes
   * arrive, so the job carries a caller-allocated slot id instead. The grid
   * renders a pending tile against it, and the finished item replaces the tile.
   */
  | { kind: 'library'; slotId: string };

export function itemTarget(itemId: string): JobTarget {
  return { kind: 'item', itemId };
}

export function variantTarget(designId: string, variantId: string): JobTarget {
  return { kind: 'variant', designId, variantId };
}

export function assetTarget(designId: string, assetId: string): JobTarget {
  return { kind: 'asset', designId, assetId };
}

export function libraryTarget(slotId: string): JobTarget {
  return { kind: 'library', slotId };
}

/**
 * One persisted job per unit of background work. Jobs survive restart: the
 * coordinator reconciles anything left `running` back into a resumable state
 * on start, because a process that died mid-run cannot be trusted to have
 * finished (spec §6, plan §6).
 */
export interface JobRecord {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** The item, variant, asset or Library slot the job belongs to. */
  target: JobTarget;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  error?: string;
  /** Set by a cancel request; the run checks it and aborts. */
  cancelRequested?: boolean;
  /**
   * What a `library` media job was asked to generate.
   *
   * On the job *record* — a file — rather than in memory, so a generation
   * interrupted by a restart can be resumed rather than failed with "the details
   * were lost". Deliberately not projected into `JobSummary`: the prompt is the
   * user's text and reactive state is read by every surface, so it stays in the
   * file the runtime alone reads.
   */
  media?: MediaJobRequest;
  /**
   * Paid media calls this job has already made (D10).
   *
   * On the record because the per-run cap has to survive a restart. The budget
   * itself is an in-memory object built when a run starts, so a generation
   * interrupted after spending its six calls would come back with six more —
   * the cap would bound a *process*, not a run, which is not what anyone asked
   * for. Incremented before the provider is called, so a crash mid-call counts
   * against the run rather than being forgotten.
   */
  mediaCallsUsed?: number;
}

/** The parameters of a Library generation, as the job remembers them. */
export interface MediaJobRequest {
  capability: MediaCapability;
  prompt: string;
  sourceItemId?: string;
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
}

function normalizeMediaJobRequest(value: unknown): MediaJobRequest | undefined {
  if (!isRecordObject(value) || !isMediaCapability(value.capability)) return undefined;
  const optionalNumber = (candidate: unknown) =>
    typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
  const optionalString = (candidate: unknown) =>
    typeof candidate === 'string' && candidate !== '' ? candidate : undefined;
  const sourceItemId = optionalString(value.sourceItemId);
  const aspectRatio = optionalString(value.aspectRatio);
  const seed = optionalNumber(value.seed);
  const durationSeconds = optionalNumber(value.durationSeconds);
  return {
    capability: value.capability,
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    ...(sourceItemId === undefined ? {} : { sourceItemId }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(seed === undefined ? {} : { seed }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
}

function normalizeJobKind(value: unknown): JobKind {
  return value === 'ingest' || value === 'generate' || value === 'media' ? value : 'analysis';
}

/**
 * A job's target, accepting the `itemId` shape written before jobs could belong
 * to a variant. Returns null when neither shape is present, so the job is
 * skipped rather than reconciled against nothing.
 */
function normalizeJobTarget(value: Record<string, unknown>): JobTarget | null {
  // Every id here is later joined onto a directory path. One that could not
  // safely be a folder name makes the whole job unreadable rather than
  // reconcilable — a path helper would throw on it once per recovery sweep.
  const id = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && isSafeId(candidate);
  const target = value.target;
  if (isRecordObject(target)) {
    if (target.kind === 'variant') {
      return id(target.designId) && id(target.variantId)
        ? { kind: 'variant', designId: target.designId, variantId: target.variantId }
        : null;
    }
    if (target.kind === 'asset') {
      return id(target.designId) && id(target.assetId)
        ? { kind: 'asset', designId: target.designId, assetId: target.assetId }
        : null;
    }
    if (target.kind === 'library') {
      return id(target.slotId) ? { kind: 'library', slotId: target.slotId } : null;
    }
    if (id(target.itemId)) return { kind: 'item', itemId: target.itemId };
    return null;
  }
  return id(value.itemId) ? { kind: 'item', itemId: value.itemId } : null;
}

/** Same contract as `normalizeItemRecord`, for job files. */
export function normalizeJobRecord(value: unknown): JobRecord | null {
  if (!isRecordObject(value)) return null;
  if (typeof value.id !== 'string' || value.id === '' || !isSafeId(value.id)) return null;

  const target = normalizeJobTarget(value);
  if (!target) return null;

  const status = value.status;
  const known = status === 'queued' || status === 'running' || status === 'succeeded' ||
    status === 'failed' || status === 'cancelled';
  const media = normalizeMediaJobRequest(value.media);

  return {
    id: value.id,
    kind: normalizeJobKind(value.kind),
    status: known ? status : 'queued',
    target,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    ...(typeof value.startedAt === 'number' ? { startedAt: value.startedAt } : {}),
    ...(typeof value.completedAt === 'number' ? { completedAt: value.completedAt } : {}),
    attempts: typeof value.attempts === 'number' ? value.attempts : 0,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    ...(value.cancelRequested === true ? { cancelRequested: true } : {}),
    ...(media === undefined ? {} : { media }),
    ...(typeof value.mediaCallsUsed === 'number' && value.mediaCallsUsed > 0
      ? { mediaCallsUsed: value.mediaCallsUsed }
      : {}),
  };
}
