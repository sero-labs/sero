/**
 * How the app is laid out: which panels are folded, and how tall the history
 * band is.
 *
 * `useGitViewState` is the part that survives a restart. This is the part that
 * does not — the height while the divider is being dragged — plus the handlers
 * that turn a click on a heading into a saved change. They are stable, so the
 * rail and the graph stay memoised through state changes that have nothing to
 * do with them.
 */

import { useCallback, useMemo, useState } from 'react';

import { useGitViewState, type GitViewState } from './ui-state';

export type RailSection = 'local' | 'remote' | 'stashes';

export interface GitLayout {
  viewState: GitViewState;
  /** The height to render at: the drag in progress, or the saved one. */
  graphHeightPct: number;
  sectionsOpen: Record<RailSection, boolean>;
  toggleSection: (section: RailSection) => void;
  toggleGraph: () => void;
  /** During a drag: local only, so nothing is written on every mouse move. */
  onDividerMove: (pct: number) => void;
  /** On release: saved. */
  onDividerCommit: (pct: number) => void;
}

export function useGitLayout(workspacePath: string): GitLayout {
  const [viewState, setViewState] = useGitViewState(workspacePath);
  const [dragHeightPct, setDragHeightPct] = useState<number | null>(null);

  const toggleGraph = useCallback(
    () => setViewState({ graphCollapsed: !viewState.graphCollapsed }),
    [setViewState, viewState.graphCollapsed],
  );

  const sectionsOpen = useMemo(
    () => ({
      local: viewState.localOpen,
      remote: viewState.remoteOpen,
      stashes: viewState.stashesOpen,
    }),
    [viewState.localOpen, viewState.remoteOpen, viewState.stashesOpen],
  );

  const toggleSection = useCallback((section: RailSection) => {
    if (section === 'local') setViewState({ localOpen: !viewState.localOpen });
    else if (section === 'remote') setViewState({ remoteOpen: !viewState.remoteOpen });
    else setViewState({ stashesOpen: !viewState.stashesOpen });
  }, [setViewState, viewState.localOpen, viewState.remoteOpen, viewState.stashesOpen]);

  const onDividerMove = useCallback((pct: number) => setDragHeightPct(pct), []);
  const onDividerCommit = useCallback((pct: number) => {
    setDragHeightPct(null);
    setViewState({ graphHeightPct: pct });
  }, [setViewState]);

  return {
    viewState,
    graphHeightPct: dragHeightPct ?? viewState.graphHeightPct,
    sectionsOpen,
    toggleSection,
    toggleGraph,
    onDividerMove,
    onDividerCommit,
  };
}
