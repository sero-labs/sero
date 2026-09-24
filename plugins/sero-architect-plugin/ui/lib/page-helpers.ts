import { openSeroApp, useAppPreferences } from '@sero-ai/app-runtime';

import type { DisclosureState } from '../components/SideColumn';
import type { RailRow } from './view-model';
import type { TraceFilters } from './activity-tree';
import { ACTIVITY_GROUPS, type ActivityGroup } from './trace';

/** Which History notes the reader has opened. A note not in `opened` is folded. */
export interface HistoryFolds {
  opened: ReadonlySet<string>;
  toggle(key: string): void;
}

/** The layout preferences the project page and the History view read. */
export type Disclosures = DisclosureState & { folds: HistoryFolds };

/** Layout preferences live in the host layout service, keyed by this app. Never browser storage. */
export function useDisclosures(): Disclosures {
  const { values, set } = useAppPreferences();
  const opened = list(values.historyFolded);
  return {
    olderOpen: values.olderOpen === true,
    setOlderOpen: (open) => set('olderOpen', open),
    folds: {
      opened: new Set(opened),
      toggle: (key) => set('historyFolded', joined(opened.includes(key)
        ? opened.filter((entry) => entry !== key)
        : [...opened, key])),
    },
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
  // A value saved by an earlier inspector (an identifier list) is not a group,
  // and is read as no filter rather than as a filter that matches nothing.
  const group = (ACTIVITY_GROUPS as readonly unknown[]).includes(values.inspectorActivities) ? values.inspectorActivities as ActivityGroup : null;
  const model = typeof values.inspectorModels === 'string' && values.inspectorModels.length > 0 && !values.inspectorModels.includes(',') ? values.inspectorModels : null;
  return {
    filters: { group, model, failuresOnly: values.inspectorFailuresOnly === true },
    expanded,
    setFilters: (filters) => {
      set('inspectorActivities', filters.group ?? '');
      set('inspectorModels', filters.model ?? '');
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
