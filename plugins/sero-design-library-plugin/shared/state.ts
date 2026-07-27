/**
 * Reactive index state for the Design Library.
 *
 * This file is the ONLY document the UI subscribes to through `useAppState`.
 * It holds lightweight summaries — never binaries, never full records. Full
 * records live under the plugin-owned storage root (see `paths.ts`).
 *
 * Writers:
 * - Extension tools append `requests` (intent) and never mutate domain rows.
 * - The background runtime is the single authoritative writer for every
 *   summary row, job row and notice.
 *
 * Both writers go through `mutateState()` in `state-io.ts`, which guards every
 * write with a `stateRevision` compare-and-swap.
 */

import { DEFAULT_DESIGN_LIBRARY_SETTINGS, DESIGN_LIBRARY_SCHEMA_VERSION } from './defaults';
import type {
  AnalysisStatus,
  DesignLibraryProfileSettings,
  EntityId,
  EpochMilliseconds,
  JobKind,
  JobStatus,
  LibraryItemSummary,
  OutputTarget,
} from './types';

export type DesignLibraryPageId = 'library' | 'design' | 'gallery';

export interface DesignSummary {
  id: EntityId;
  title: string;
  request: string;
  outputTarget: OutputTarget;
  referenceCount: number;
  variantCount: number;
  readyVariantCount: number;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface GalleryVersionSummary {
  id: EntityId;
  title: string;
  outputTarget: OutputTarget;
  createdAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface GalleryFamilySummary {
  id: EntityId;
  title: string;
  featuredVersionId: EntityId;
  versions: GalleryVersionSummary[];
  linkedSourceFamilyId?: EntityId;
  updatedAt: EpochMilliseconds;
  deletedAt?: EpochMilliseconds;
}

export interface JobSummary {
  id: EntityId;
  kind: JobKind;
  /** Library item id, variant id or generated-asset id depending on `kind`. */
  ownerId: EntityId;
  /** Design id for variant and generated-asset jobs. */
  scopeId?: EntityId;
  status: JobStatus;
  attempt: number;
  label: string;
  progress?: string;
  errorMessage?: string;
  updatedAt: EpochMilliseconds;
}

export type NoticeLevel = 'info' | 'warning' | 'error';

export interface Notice {
  id: EntityId;
  level: NoticeLevel;
  message: string;
  /** Optional detail lines — e.g. dropped tweak controls with their reasons. */
  details?: string[];
  createdAt: EpochMilliseconds;
}

export interface LibraryFilters {
  tags: string[];
  colours: string[];
  sources: string[];
  analysisStatuses: AnalysisStatus[];
  /** Inclusive lower bound on `createdAt`, in epoch milliseconds. */
  createdAfter?: EpochMilliseconds;
  includeDeleted: boolean;
}

export interface DesignLibraryUiState {
  activePage: DesignLibraryPageId;
  search: string;
  filters: LibraryFilters;
  activeDesignId?: EntityId;
  activeVariantId?: EntityId;
  activeItemId?: EntityId;
  activeFamilyId?: EntityId;
  /** Ordered draft selection used to create the next Design. */
  referenceDraft: EntityId[];
}

/** Requests are append-only intents written by extension tools. */
export interface DesignLibraryRequest {
  id: number;
  action: string;
  payload: Record<string, unknown>;
  requestedAt: EpochMilliseconds;
}

export interface DesignLibraryState {
  schemaVersion: number;
  /** Compare-and-swap guard — incremented by every successful write. */
  stateRevision: number;
  items: LibraryItemSummary[];
  designs: DesignSummary[];
  families: GalleryFamilySummary[];
  jobs: JobSummary[];
  notices: Notice[];
  settings: DesignLibraryProfileSettings;
  ui: DesignLibraryUiState;
  requests: DesignLibraryRequest[];
  nextRequestId: number;
  /** Highest request id the runtime has consumed. */
  consumedRequestId: number;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  tags: [],
  colours: [],
  sources: [],
  analysisStatuses: [],
  includeDeleted: false,
};

export const DEFAULT_STATE: DesignLibraryState = {
  schemaVersion: DESIGN_LIBRARY_SCHEMA_VERSION,
  stateRevision: 0,
  items: [],
  designs: [],
  families: [],
  jobs: [],
  notices: [],
  settings: DEFAULT_DESIGN_LIBRARY_SETTINGS,
  ui: {
    activePage: 'library',
    search: '',
    filters: DEFAULT_LIBRARY_FILTERS,
    referenceDraft: [],
  },
  requests: [],
  nextRequestId: 1,
  consumedRequestId: 0,
};

/** Requests the runtime has not yet consumed, in submission order. */
export function pendingRequests(state: DesignLibraryState): DesignLibraryRequest[] {
  return state.requests
    .filter((request) => request.id > state.consumedRequestId)
    .sort((left, right) => left.id - right.id);
}
