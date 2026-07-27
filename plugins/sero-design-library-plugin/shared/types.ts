/**
 * Reactive state — the single JSON document shared by the extension, the UI
 * and the background runtime.
 *
 * It holds lightweight summaries only. Full records and binaries are
 * plugin-owned files (spec §12), and every summary here is a pure projection
 * of those records, which is what makes an interrupted index write
 * recoverable: the projection can always be rebuilt from the records.
 */

import type { AnalysisStatus, Collection, JobKind, JobStatus, MediaKind } from './records';
import type { LibraryRequest } from './requests';
import { isLibraryRequest } from './requests';
import type { DesignLibrarySettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';

export const STATE_SCHEMA_VERSION = 1;

export interface ItemSummary {
  id: string;
  title: string;
  primaryStyle: string;
  /** Trimmed for the card; the full set lives in the record. */
  tags: string[];
  designTypes: string[];
  kind: MediaKind;
  /** Path relative to the app state directory, for the UI to request bytes. */
  previewPath: string;
  analysisStatus: AnalysisStatus;
  /** Why analysis failed. Carried in the summary so a failure explains itself. */
  analysisError?: string;
  favourite: boolean;
  collectionIds: string[];
  /** Palette hexes, for the colour filter and card accents. */
  colours: string[];
  sourceKind: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** True when any field carries a user override. Drives the "edited" marker. */
  edited: boolean;
  /** Lowercased searchable blob projected from the effective analysis. */
  searchText: string;
}

export interface JobSummary {
  id: string;
  kind: JobKind;
  status: JobStatus;
  itemId: string;
  createdAt: number;
  error?: string;
}

export type LibraryScope =
  | { kind: 'all' }
  | { kind: 'favourites' }
  | { kind: 'awaiting' }
  | { kind: 'recent' }
  | { kind: 'trash' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'style'; style: string };

export type LibrarySort = 'newest' | 'oldest' | 'title';

export interface LibraryFilters {
  mediaKinds: MediaKind[];
  styles: string[];
  tags: string[];
  colours: string[];
  sourceKinds: string[];
  analysisStatuses: AnalysisStatus[];
  /** Epoch millis; items created before this are hidden. */
  createdAfter?: number;
}

export interface ViewPreferences {
  scope: LibraryScope;
  query: string;
  filters: LibraryFilters;
  sort: LibrarySort;
  selectedItemId?: string;
}

export interface DesignLibraryState {
  schemaVersion: number;
  /** Bumped on every write. Writers compare-and-swap against it. */
  revision: number;
  items: ItemSummary[];
  collections: Collection[];
  jobs: JobSummary[];
  settings: DesignLibrarySettings;
  view: ViewPreferences;
  requests: LibraryRequest[];
  nextRequestId: number;
  /** Highest request id the runtime has applied. Monotonic. */
  consumedRequestId: number;
}

export const EMPTY_FILTERS: LibraryFilters = {
  mediaKinds: [],
  styles: [],
  tags: [],
  colours: [],
  sourceKinds: [],
  analysisStatuses: [],
};

export const DEFAULT_STATE: DesignLibraryState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  revision: 0,
  items: [],
  collections: [],
  jobs: [],
  settings: DEFAULT_SETTINGS,
  view: {
    scope: { kind: 'all' },
    query: '',
    filters: EMPTY_FILTERS,
    sort: 'newest',
  },
  requests: [],
  nextRequestId: 1,
  consumedRequestId: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeItem(value: unknown): ItemSummary | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string') return null;
  return {
    id: value.id,
    title: typeof value.title === 'string' ? value.title : 'Untitled',
    primaryStyle: typeof value.primaryStyle === 'string' ? value.primaryStyle : '',
    tags: stringArray(value.tags),
    designTypes: stringArray(value.designTypes),
    kind: value.kind === 'video' ? 'video' : 'image',
    previewPath: typeof value.previewPath === 'string' ? value.previewPath : '',
    analysisStatus: normalizeAnalysisStatus(value.analysisStatus),
    ...(typeof value.analysisError === 'string' ? { analysisError: value.analysisError } : {}),
    favourite: value.favourite === true,
    collectionIds: stringArray(value.collectionIds),
    colours: stringArray(value.colours),
    sourceKind: typeof value.sourceKind === 'string' ? value.sourceKind : 'file',
    createdAt: num(value.createdAt, 0),
    updatedAt: num(value.updatedAt, 0),
    ...(typeof value.deletedAt === 'number' ? { deletedAt: value.deletedAt } : {}),
    edited: value.edited === true,
    searchText: typeof value.searchText === 'string' ? value.searchText : '',
  };
}

function normalizeAnalysisStatus(value: unknown): AnalysisStatus {
  return value === 'running' || value === 'ready' || value === 'failed' || value === 'cancelled'
    ? value
    : 'pending';
}

function normalizeCollection(value: unknown): Collection | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : 'Untitled collection',
    colour: typeof value.colour === 'string' ? value.colour : 'primary',
    createdAt: num(value.createdAt, 0),
  };
}

function normalizeJob(value: unknown): JobSummary | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const status = value.status;
  return {
    id: value.id,
    kind: value.kind === 'ingest' ? 'ingest' : 'analysis',
    status:
      status === 'running' || status === 'succeeded' || status === 'failed' || status === 'cancelled'
        ? status
        : 'queued',
    itemId: typeof value.itemId === 'string' ? value.itemId : '',
    createdAt: num(value.createdAt, 0),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  };
}

function normalizeScope(value: unknown): LibraryScope {
  if (!isRecord(value)) return { kind: 'all' };
  switch (value.kind) {
    case 'favourites':
    case 'awaiting':
    case 'recent':
    case 'trash':
      return { kind: value.kind };
    case 'collection':
      return typeof value.collectionId === 'string'
        ? { kind: 'collection', collectionId: value.collectionId }
        : { kind: 'all' };
    case 'style':
      return typeof value.style === 'string' ? { kind: 'style', style: value.style } : { kind: 'all' };
    default:
      return { kind: 'all' };
  }
}

function normalizeFilters(value: unknown): LibraryFilters {
  if (!isRecord(value)) return { ...EMPTY_FILTERS };
  const mediaKinds = stringArray(value.mediaKinds).filter(
    (kind): kind is MediaKind => kind === 'image' || kind === 'video',
  );
  const analysisStatuses = stringArray(value.analysisStatuses).map(normalizeAnalysisStatus);
  return {
    mediaKinds,
    styles: stringArray(value.styles),
    tags: stringArray(value.tags),
    colours: stringArray(value.colours),
    sourceKinds: stringArray(value.sourceKinds),
    analysisStatuses,
    ...(typeof value.createdAfter === 'number' ? { createdAfter: value.createdAfter } : {}),
  };
}

function normalizeView(value: unknown): ViewPreferences {
  if (!isRecord(value)) return { ...DEFAULT_STATE.view };
  const sort = value.sort;
  return {
    scope: normalizeScope(value.scope),
    query: typeof value.query === 'string' ? value.query : '',
    filters: normalizeFilters(value.filters),
    sort: sort === 'oldest' || sort === 'title' ? sort : 'newest',
    ...(typeof value.selectedItemId === 'string' ? { selectedItemId: value.selectedItemId } : {}),
  };
}

function normalizeSettings(value: unknown): DesignLibrarySettings {
  if (!isRecord(value)) return structuredClone(DEFAULT_SETTINGS);
  const generation = isRecord(value.generation) ? value.generation : {};
  const layout = isRecord(value.layout) ? value.layout : {};
  const recipes = Array.isArray(generation.recipes)
    ? generation.recipes.filter(isRecord).map((recipe) => ({
        id: typeof recipe.id === 'string' ? recipe.id : '',
        name: typeof recipe.name === 'string' ? recipe.name : '',
        instruction: typeof recipe.instruction === 'string' ? recipe.instruction : '',
        builtIn: recipe.builtIn === true,
      }))
    : DEFAULT_SETTINGS.generation.recipes;
  return {
    librarianModel: normalizeModel(value.librarianModel),
    designModel: normalizeModel(value.designModel),
    generation: {
      variantCount: Math.min(5, Math.max(1, num(generation.variantCount, 3))),
      revisionBehaviour: generation.revisionBehaviour === 'retain' ? 'retain' : 'replace',
      recipes: recipes.filter((recipe) => recipe.id !== ''),
    },
    layout: {
      inspectorWidth: Math.min(720, Math.max(280, num(layout.inspectorWidth, 352))),
      sessionsRailCollapsed: layout.sessionsRailCollapsed === true,
    },
  };
}

function normalizeModel(value: unknown): DesignLibrarySettings['librarianModel'] {
  if (!isRecord(value)) return { providerId: '', modelId: '' };
  return {
    providerId: typeof value.providerId === 'string' ? value.providerId : '',
    modelId: typeof value.modelId === 'string' ? value.modelId : '',
  };
}

export function normalizeState(value: unknown): DesignLibraryState {
  if (!isRecord(value)) return structuredClone(DEFAULT_STATE);

  const requests = Array.isArray(value.requests) ? value.requests.filter(isLibraryRequest) : [];
  const highestRequestId = requests.reduce((max, request) => Math.max(max, request.id), 0);

  return {
    schemaVersion: num(value.schemaVersion, STATE_SCHEMA_VERSION),
    revision: num(value.revision, 0),
    items: Array.isArray(value.items)
      ? value.items.map(normalizeItem).filter((item): item is ItemSummary => item !== null)
      : [],
    collections: Array.isArray(value.collections)
      ? value.collections
          .map(normalizeCollection)
          .filter((entry): entry is Collection => entry !== null)
      : [],
    jobs: Array.isArray(value.jobs)
      ? value.jobs.map(normalizeJob).filter((job): job is JobSummary => job !== null)
      : [],
    settings: normalizeSettings(value.settings),
    view: normalizeView(value.view),
    requests,
    nextRequestId: Math.max(num(value.nextRequestId, 1), highestRequestId + 1),
    consumedRequestId: num(value.consumedRequestId, 0),
  };
}
