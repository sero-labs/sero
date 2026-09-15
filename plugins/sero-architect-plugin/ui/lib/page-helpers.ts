import { openSeroApp, useAppPreferences } from '@sero-ai/app-runtime';

import type { DisclosureState } from '../components/SideColumn';
import type { RailRow } from './view-model';
import type { TraceFilters } from './timeline';

/** Layout preferences live in the host layout service, keyed by this app. Never browser storage. */
export function useDisclosures(): DisclosureState {
  const { values, set } = useAppPreferences();
  return {
    historyOpen: values.historyOpen === true,
    olderOpen: values.olderOpen === true,
    setHistoryOpen: (open) => set('historyOpen', open),
    setOlderOpen: (open) => set('olderOpen', open),
  };
}

/**
 * The host stores a scalar per key, so a list travels joined.
 *
 * Activity kinds and model ids are identifier-like and contain no comma, so a
 * comma round-trips them without an escaping scheme that would need its own
 * tests.
 */
const list = (value: unknown): string[] =>
  typeof value === 'string' && value.length > 0 ? value.split(',').filter(Boolean) : [];
const joined = (values: readonly string[]): string => values.join(',');

/**
 * The inspector's persisted view: which filters are on and which rows are open.
 *
 * It survives a return to the project because it lives in the host layout
 * service, so coming back to the inspector shows what was being looked at
 * instead of resetting to the whole trace.
 */
export function useInspectorPreferences(): {
  filters: TraceFilters;
  expanded: string[];
  setFilters(filters: TraceFilters): void;
  toggleExpanded(operationId: string): void;
} {
  const { values, set } = useAppPreferences();
  const expanded = list(values.inspectorExpanded);
  return {
    filters: {
      activities: list(values.inspectorActivities),
      models: list(values.inspectorModels),
      failuresOnly: values.inspectorFailuresOnly === true,
    },
    expanded,
    setFilters: (filters) => {
      set('inspectorActivities', joined(filters.activities));
      set('inspectorModels', joined(filters.models));
      set('inspectorFailuresOnly', filters.failuresOnly);
    },
    toggleExpanded: (operationId) => {
      set('inspectorExpanded', joined(expanded.includes(operationId)
        ? expanded.filter((entry) => entry !== operationId)
        : [...expanded, operationId]));
    },
  };
}

/** Opens the Orchestrator on the dispatched Workflow or Room. */
export function openDispatch(link: NonNullable<RailRow['link']>): void {
  void openSeroApp('orchestrator', link.kind === 'room' ? { roomId: link.id } : { loopId: link.id }, link.workspaceId);
}
