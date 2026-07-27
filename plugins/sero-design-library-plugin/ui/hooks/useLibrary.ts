import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { createDebouncedFn } from '@sero-ai/common';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { LibrarianField, LibrarianUserFacingAnalysis } from '../../shared/librarian';
import { deriveFacets, selectItems } from '../../shared/search';
import type { DesignLibrarySettings } from '../../shared/settings';
import type { DesignLibraryState, LibraryFilters, LibraryScope, LibrarySort, ViewPreferences } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';

/**
 * One place the whole app reads state and asks for changes.
 *
 * View preferences are held locally and persisted on a debounce: typing in the
 * search box must not queue a request per keystroke, but the preference still
 * belongs in plugin state, and it gets there through the same single-writer
 * path as everything else.
 */

const VIEW_PERSIST_MS = 600;

export interface LibraryActions {
  setScope(scope: LibraryScope): void;
  setQuery(query: string): void;
  setFilters(filters: LibraryFilters): void;
  setSort(sort: LibrarySort): void;
  select(itemId: string | undefined): void;
  setField(itemId: string, field: LibrarianField, value: LibrarianUserFacingAnalysis[LibrarianField]): Promise<void>;
  resetField(itemId: string, field: LibrarianField): Promise<void>;
  favourite(itemId: string, favourite: boolean): Promise<void>;
  collect(itemId: string, collectionId: string, member: boolean): Promise<void>;
  remove(itemId: string): Promise<void>;
  restore(itemId: string): Promise<void>;
  purge(itemId: string): Promise<void>;
  reanalyse(itemId: string): Promise<void>;
  cancelAnalysis(itemId: string): Promise<void>;
  createCollection(name: string, colour: string): Promise<void>;
  renameCollection(collectionId: string, name: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<void>;
  updateSettings(patch: Partial<DesignLibrarySettings>): Promise<void>;
}

export interface Library {
  state: DesignLibraryState;
  view: ViewPreferences;
  /** The items the current scope, filters and query select, already sorted. */
  visible: ReturnType<typeof selectItems>;
  facets: ReturnType<typeof deriveFacets>;
  selected: DesignLibraryState['items'][number] | undefined;
  actions: LibraryActions;
}

export function useLibrary(): Library {
  const [state] = useAppState<DesignLibraryState>(DEFAULT_STATE);
  const tools = useAppTools();

  // Local view state leads; the persisted copy follows. `null` means "nothing
  // changed locally yet", so a view restored from state on load still wins.
  const [localView, setLocalView] = useState<Partial<ViewPreferences> | null>(null);
  const view = useMemo<ViewPreferences>(
    () => ({ ...state.view, ...(localView ?? {}) }),
    [state.view, localView],
  );

  // Built once, lazily. `useRef(createDebouncedFn(...))` keeps the first value
  // but still *calls* the factory on every render, allocating a timer-holding
  // closure each time only to discard it.
  const persistRef = useRef<((patch: Partial<ViewPreferences>) => void) | null>(null);
  persistRef.current ??= createDebouncedFn((patch: Partial<ViewPreferences>) => {
    void tools.run('design_library_settings', { action: 'set-view', view: patch });
  }, VIEW_PERSIST_MS);
  const persistView = persistRef.current;

  const patchView = useCallback(
    (patch: Partial<ViewPreferences>) => {
      setLocalView((current) => ({ ...(current ?? {}), ...patch }));
      persistView(patch);
    },
    [persistView],
  );

  const run = useCallback(
    async (tool: string, params: Record<string, unknown>) => {
      await tools.run(tool, params);
    },
    [tools],
  );

  const actions = useMemo<LibraryActions>(
    () => ({
      setScope: (scope) => patchView({ scope }),
      setQuery: (query) => patchView({ query }),
      setFilters: (filters) => patchView({ filters }),
      setSort: (sort) => patchView({ sort }),
      select: (selectedItemId) => patchView({ selectedItemId }),

      setField: (itemId, field, value) =>
        run('design_library_items', { action: 'set-field', itemId, field, value }),
      resetField: (itemId, field) =>
        run('design_library_items', { action: 'reset-field', itemId, field }),
      favourite: (itemId, favourite) =>
        run('design_library_items', { action: 'favourite', itemId, favourite }),
      collect: (itemId, collectionId, member) =>
        run('design_library_items', { action: 'collect', itemId, collectionId, member }),
      remove: (itemId) => run('design_library_items', { action: 'delete', itemId }),
      restore: (itemId) => run('design_library_items', { action: 'restore', itemId }),
      purge: (itemId) => run('design_library_items', { action: 'purge', itemId }),

      reanalyse: (itemId) => run('design_library_analysis', { action: 'reanalyse', itemId }),
      cancelAnalysis: (itemId) => run('design_library_analysis', { action: 'cancel', itemId }),

      createCollection: (name, colour) =>
        run('design_library_items', { action: 'create-collection', name, colour }),
      renameCollection: (collectionId, name) =>
        run('design_library_items', { action: 'rename-collection', collectionId, name }),
      deleteCollection: (collectionId) =>
        run('design_library_items', { action: 'delete-collection', collectionId }),

      updateSettings: async (patch) => {
        // Settings changes are infrequent and individually meaningful, so each
        // one is applied through its own typed action rather than a blob patch.
        if (patch.librarianModel) {
          await run('design_library_settings', { action: 'set-model', role: 'librarian', ...patch.librarianModel });
        }
        if (patch.designModel) {
          await run('design_library_settings', { action: 'set-model', role: 'design', ...patch.designModel });
        }
        if (patch.generation) {
          await run('design_library_settings', {
            action: 'set-generation',
            variantCount: patch.generation.variantCount,
            revisionBehaviour: patch.generation.revisionBehaviour,
          });
        }
        if (patch.layout) {
          await run('design_library_settings', { action: 'set-layout', ...patch.layout });
        }
      },
    }),
    [patchView, run],
  );

  const visible = useMemo(() => selectItems(state.items, view), [state.items, view]);
  const facets = useMemo(() => deriveFacets(state.items), [state.items]);
  const selected = useMemo(
    () => state.items.find((item) => item.id === view.selectedItemId),
    [state.items, view.selectedItemId],
  );

  return { state, view, visible, facets, selected, actions };
}
