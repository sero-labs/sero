import { openSeroApp, useAppPreferences } from '@sero-ai/app-runtime';

import type { DisclosureState } from '../components/SideColumn';
import type { RailRow } from './view-model';

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

/** Opens the Orchestrator on the dispatched Workflow or Room. */
export function openDispatch(link: NonNullable<RailRow['link']>): void {
  void openSeroApp('orchestrator', link.kind === 'room' ? { roomId: link.id } : { loopId: link.id });
}
