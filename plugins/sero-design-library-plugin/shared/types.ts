/**
 * Reactive state — the single JSON document shared by the extension, the UI
 * and the background runtime.
 *
 * It holds bounded control state only. Entity records and compact indexes are
 * plugin-owned files beside this document.
 */

import type { ColourFamily } from './colour-families';
import { isColourFamily } from './colour-families';
import type { OutputTarget, VariantStatus, VariationMode } from './design';
import type { MediaCapability, MediaModelOptions } from './media';
import { MEDIA_CAPABILITIES, normalizeModelOptions } from './media';
import type { AnalysisStatus, Collection, MediaKind } from './records';
import type { ItemIndexEntry, JobIndexEntry } from './indexes';
import type { LibraryRequest } from './requests';
import { isLibraryRequest } from './requests';
import type { DesignLibrarySettings, MediaSettings } from './settings';
import { DEFAULT_SETTINGS, MAX_CALLS_PER_RUN } from './settings';

export const STATE_SCHEMA_VERSION = 2;

/** @deprecated Use ItemIndexEntry for index and card data. */
export type ItemSummary = ItemIndexEntry;
/** @deprecated Use JobIndexEntry for job list data. */
export type JobSummary = JobIndexEntry;

/**
 * One variant, as the sessions rail and the variant tabs need it.
 *
 * No code and no file contents: reactive state carries summaries only, and a
 * generated page runs to tens of kilobytes. The UI reads the built document
 * through the asset tool using `previewPath`.
 */
export interface DesignVariantSummary {
  id: string;
  index: number;
  status: VariantStatus;
  /** Latest generation activity, shown in the preview pane while working. */
  progress?: string;
  /** What the run called this design. Absent until it has produced one. */
  name?: string;
  error?: string;
  /** Home-relative path to the visible revision's built document, when built. */
  previewPath?: string;
  /** Non-empty means the build refused something; the detail is on the record. */
  warningCount: number;
  revisionCount: number;
  visibleRevisionId?: string;
  /** For `per-reference` mode: the reference this variant came from. */
  referenceItemId?: string;
}

export interface DesignSummary {
  id: string;
  title: string;
  target: OutputTarget;
  variationMode: VariationMode;
  /** Ordered; position 0 is primary. */
  referenceItemIds: string[];
  variants: DesignVariantSummary[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
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
  colourFamilies: ColourFamily[];
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
  /** The Design on screen. Set by opening one, cleared by leaving the surface. */
  selectedDesignId?: string;
  /** Which variant tab is active within the open Design. */
  activeVariantId?: string;
}

/**
 * A change to the view, where `null` means "clear this".
 *
 * `undefined` cannot express it: the patch travels through the request log as
 * JSON, and `JSON.stringify` drops an undefined value entirely — so leaving a
 * Design or a reference would merge an empty object and the old selection would
 * survive, invisibly, until the next restart brought it back.
 */
export type ViewPatch = { [K in keyof ViewPreferences]?: ViewPreferences[K] | null };
export type LibraryViewPreferences = ViewPreferences;

/** Apply a patch, turning an explicit `null` into an absent key. */
export function applyViewPatch(view: ViewPreferences, patch: ViewPatch): ViewPreferences {
  const next: Record<string, unknown> = { ...view };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as unknown as ViewPreferences;
}

export interface DesignLibraryState {
  schemaVersion: number;
  /** Bumped on every write. Writers compare-and-swap against it. */
  revision: number;
  collections: Collection[];
  settings: DesignLibrarySettings;
  /**
   * What each capability's model accepts — clip lengths, aspect ratios — as the
   * provider last reported it (D7).
   *
   * A cache, not a record. An absent entry means "nobody could say", never "no
   * constraints", so the pickers fall back rather than offering nothing. The
   * generation path settles against the provider directly and does not read
   * this.
   */
  mediaOptions: Partial<Record<MediaCapability, MediaModelOptions>>;
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
  colourFamilies: [],
  sourceKinds: [],
  analysisStatuses: [],
};

export const DEFAULT_STATE: DesignLibraryState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  revision: 0,
  collections: [],
  settings: DEFAULT_SETTINGS,
  mediaOptions: {},
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
    // Raw colour filters from the first enhancement draft are deliberately
    // dropped. Families are stable when new references add more exact hexes.
    colourFamilies: stringArray(value.colourFamilies).filter(isColourFamily),
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
    ...(typeof value.selectedDesignId === 'string'
      ? { selectedDesignId: value.selectedDesignId }
      : {}),
    ...(typeof value.activeVariantId === 'string' ? { activeVariantId: value.activeVariantId } : {}),
  };
}

function normalizeSettings(value: unknown): DesignLibrarySettings {
  if (!isRecord(value)) return structuredClone(DEFAULT_SETTINGS);
  const generation = isRecord(value.generation) ? value.generation : {};
  const layout = isRecord(value.layout) ? value.layout : {};
  const recipes = Array.isArray(generation.recipes)
    ? generation.recipes.flatMap((recipe) =>
        isRecord(recipe)
          ? [
              {
                id: typeof recipe.id === 'string' ? recipe.id : '',
                name: typeof recipe.name === 'string' ? recipe.name : '',
                instruction: typeof recipe.instruction === 'string' ? recipe.instruction : '',
                builtIn: recipe.builtIn === true,
              },
            ]
          : [],
      )
    : DEFAULT_SETTINGS.generation.recipes;
  return {
    librarianModel: normalizeModel(value.librarianModel),
    designModel: normalizeModel(value.designModel),
    generation: {
      variantCount: Math.min(5, Math.max(1, num(generation.variantCount, 3))),
      revisionBehaviour: generation.revisionBehaviour === 'retain' ? 'retain' : 'replace',
      recipes: recipes.filter((recipe) => recipe.id !== ''),
    },
    media: normalizeMedia(value.media),
    layout: {
      inspectorWidth: Math.min(720, Math.max(280, num(layout.inspectorWidth, 352))),
      sessionsRailCollapsed: layout.sessionsRailCollapsed === true,
    },
  };
}

function normalizeMedia(value: unknown): MediaSettings {
  const media = isRecord(value) ? value : {};
  const stored = isRecord(media.models) ? media.models : {};
  const models = Object.fromEntries(
    MEDIA_CAPABILITIES.map((capability) => [
      capability,
      typeof stored[capability] === 'string' ? stored[capability] : '',
    ]),
  ) as MediaSettings['models'];
  return {
    models,
    // Clamped rather than trusted: the cap is the whole spend protection, and a
    // state file edited to zero or to a million is a file, not an impossibility.
    callsPerRun: Math.min(
      MAX_CALLS_PER_RUN,
      Math.max(0, Math.round(num(media.callsPerRun, DEFAULT_SETTINGS.media.callsPerRun))),
    ),
  };
}

function normalizeModel(value: unknown): DesignLibrarySettings['librarianModel'] {
  if (!isRecord(value)) return { providerId: '', modelId: '' };
  return {
    providerId: typeof value.providerId === 'string' ? value.providerId : '',
    modelId: typeof value.modelId === 'string' ? value.modelId : '',
  };
}

function normalizeMediaOptions(value: unknown): Partial<Record<MediaCapability, MediaModelOptions>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    MEDIA_CAPABILITIES.flatMap((capability) => {
      if (!(capability in value)) return [];
      const options = normalizeModelOptions(value[capability]);
      return Object.keys(options).length === 0 ? [] : [[capability, options] as const];
    }),
  );
}

export function normalizeState(value: unknown): DesignLibraryState {
  if (!isRecord(value)) return structuredClone(DEFAULT_STATE);

  const requests = Array.isArray(value.requests) ? value.requests.filter(isLibraryRequest) : [];
  const highestRequestId = requests.reduce((max, request) => Math.max(max, request.id), 0);

  return {
    schemaVersion: num(value.schemaVersion, STATE_SCHEMA_VERSION),
    revision: num(value.revision, 0),
    collections: Array.isArray(value.collections)
      ? value.collections.flatMap((entry) => {
          const collection = normalizeCollection(entry);
          return collection === null ? [] : [collection];
        })
      : [],
    settings: normalizeSettings(value.settings),
    mediaOptions: normalizeMediaOptions(value.mediaOptions),
    view: normalizeView(value.view),
    requests,
    nextRequestId: Math.max(num(value.nextRequestId, 1), highestRequestId + 1),
    consumedRequestId: num(value.consumedRequestId, 0),
  };
}
