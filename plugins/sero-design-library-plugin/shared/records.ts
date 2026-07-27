/**
 * Full on-disk record shapes. These never enter reactive state — the UI reads
 * them on demand through read-only extension tools.
 */

import type { Revisioned } from './state-io';
import type { TweakManifest, TweakValue, TweakWorkingState } from './tweak-types';
import type {
  AnalysisStatus,
  DesignLibraryProfileSettings,
  EditableLibrarianProfile,
  EntityId,
  EpochMilliseconds,
  GeneratedAssetProvenance,
  JobKind,
  JobStatus,
  OrderedDesignReference,
  OutputTarget,
} from './types';

export type ImportSource = 'file-picker' | 'drag-drop' | 'clipboard' | 'generated-asset';

export interface StoredAsset {
  /** File name inside the owning directory. */
  fileName: string;
  mimeType: string;
  byteLength: number;
  checksum: string;
  width?: number;
  height?: number;
}

export interface LibraryItemRecord extends Revisioned {
  id: EntityId;
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
  source: ImportSource;
  originalFileName: string;
  original: StoredAsset;
  preview: StoredAsset;
  analysisStatus: AnalysisStatus;
  analysisError?: string;
  /** Present once the Librarian has produced at least one analysis. */
  profile?: EditableLibrarianProfile;
  /** Retained when the item was promoted from a generated asset. */
  generationProvenance?: GeneratedAssetProvenance;
  analysisAttempts: number;
}

export interface SourceFile {
  path: string;
  contents: string;
}

/** One recoverable state in a variant's history. */
export interface VariantRevisionRecord {
  id: EntityId;
  variantId: EntityId;
  revisionNumber: number;
  outputTarget: OutputTarget;
  files: SourceFile[];
  /** Design-owned generated assets referenced by this revision. */
  assetIds: EntityId[];
  tweakManifest: TweakManifest;
  tweakOverrides: Record<string, TweakValue>;
  droppedTweakControls: Array<{ id: string; label: string; reason: string }>;
  createdAt: EpochMilliseconds;
  createdReason: 'generated' | 'revised' | 'tweak-checkpoint' | 'asset-retry';
  deletedAt?: EpochMilliseconds;
}

export interface DesignVariantRecord {
  id: EntityId;
  title: string;
  status: JobStatus;
  errorMessage?: string;
  visibleRevisionId?: EntityId;
  revisions: VariantRevisionRecord[];
  /** Unsaved tweak edits, checkpointed into a revision at a session boundary. */
  tweakWorking?: TweakWorkingState;
}

export interface GeneratedAssetRecord {
  id: EntityId;
  designId: EntityId;
  title: string;
  prompt: string;
  status: 'ready' | 'placeholder';
  fileName: string;
  mimeType: string;
  byteLength: number;
  provenance: GeneratedAssetProvenance;
  /** Superseded placeholder/asset states, newest last. */
  history: Array<{ status: 'ready' | 'placeholder'; fileName: string; at: EpochMilliseconds }>;
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
  promotedItemId?: EntityId;
}

export interface GuardrailConflict {
  always: string;
  never: string;
  primaryItemId: EntityId;
  conflictingItemId: EntityId;
  resolvedAt?: EpochMilliseconds;
  resolution?: 'keep-always' | 'keep-never';
}

export interface DesignRecord extends Revisioned {
  id: EntityId;
  title: string;
  request: string;
  outputTarget: OutputTarget;
  references: OrderedDesignReference[];
  variants: DesignVariantRecord[];
  assets: GeneratedAssetRecord[];
  conflicts: GuardrailConflict[];
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
  /** Reopened-from pointer when the Design was restored from a Gallery version. */
  reopenedFromVersionId?: EntityId;
}

export interface GalleryVersionSnapshot {
  id: EntityId;
  familyId: EntityId;
  title: string;
  outputTarget: OutputTarget;
  sourceDesignId: EntityId;
  sourceVariantId: EntityId;
  sourceRevisionId: EntityId;
  /** Exact code with effective tweak values resolved into it. */
  files: SourceFile[];
  tweakManifest: TweakManifest;
  tweakValues: Record<string, TweakValue>;
  assets: Array<{ id: EntityId; fileName: string; mimeType: string }>;
  /** Immutable, script-free document used for the deterministic card preview. */
  previewFileName: string;
  request: string;
  guardrails: { always: string[]; never: string[] };
  references: OrderedDesignReference[];
  provenance: {
    modelId?: string;
    providerId?: string;
    savedAt: EpochMilliseconds;
    dependencies: string[];
  };
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface GalleryFamilyRecord extends Revisioned {
  id: EntityId;
  title: string;
  versionIds: EntityId[];
  featuredVersionId: EntityId;
  linkedSourceFamilyId?: EntityId;
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface JobRecord extends Revisioned {
  id: EntityId;
  kind: JobKind;
  ownerId: EntityId;
  scopeId?: EntityId;
  status: JobStatus;
  attempt: number;
  label: string;
  payload: Record<string, unknown>;
  errorMessage?: string;
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
}

export interface DesignLibrarySettingsRecord extends Revisioned {
  settings: DesignLibraryProfileSettings;
}
