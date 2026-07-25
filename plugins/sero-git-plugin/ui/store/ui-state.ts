/**
 * The Git app's own view state — currently just where the graph divider sits.
 *
 * Kept in its own file rather than in the repo state the extension owns: that
 * file is rewritten on every filesystem change in live mode, so writing view
 * state into it would race the extension and broadcast a repo-state change to
 * every git surface on each drag of the divider.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GitViewState {
  /** Height of the graph band, as a percentage of the app below the top bar. */
  graphHeightPct: number;
  /**
   * Which files the AI resolver resolved, and in which merge (§7). The run
   * itself lives in memory, so without this a reload mid-merge would lose the
   * marks that say whose resolution a file holds.
   *
   * Keyed by the merge it belongs to: a record left over from a previous merge
   * would otherwise mark files nothing has touched this time.
   */
  aiResolved?: { mergeRef: string; paths: string[] };
}

export const DEFAULT_GRAPH_HEIGHT_PCT = 38;
export const MIN_GRAPH_HEIGHT_PCT = 12;
export const MAX_GRAPH_HEIGHT_PCT = 80;

const DEFAULTS: GitViewState = { graphHeightPct: DEFAULT_GRAPH_HEIGHT_PCT };

interface AppStateBridge {
  read<T = unknown>(filePath: string): Promise<T>;
  write<T = unknown>(filePath: string, data: T): Promise<void>;
}

function bridge(): AppStateBridge | null {
  return (window as unknown as { sero?: { appState?: AppStateBridge } }).sero?.appState ?? null;
}

function viewStatePath(workspacePath: string): string {
  return `${workspacePath.replace(/\/+$/, '')}/.sero/apps/git/view.json`;
}

function normalise(value: unknown): GitViewState {
  const stored = value as GitViewState | null;
  const pct = stored?.graphHeightPct;
  const graphHeightPct = typeof pct === 'number' && Number.isFinite(pct)
    ? Math.min(MAX_GRAPH_HEIGHT_PCT, Math.max(MIN_GRAPH_HEIGHT_PCT, pct))
    : DEFAULTS.graphHeightPct;

  const aiResolved = stored?.aiResolved;
  const valid = typeof aiResolved?.mergeRef === 'string' && Array.isArray(aiResolved.paths);
  return valid
    ? { graphHeightPct, aiResolved: { mergeRef: aiResolved.mergeRef, paths: aiResolved.paths } }
    : { graphHeightPct };
}

/**
 * Per-workspace view state. Reads once per workspace and writes back on change;
 * a missing or unreadable file is simply the default.
 */
export function useGitViewState(
  workspacePath: string,
): [GitViewState, (patch: Partial<GitViewState>) => void] {
  const [state, setState] = useState<GitViewState>(DEFAULTS);
  const pathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspacePath) return;
    const filePath = viewStatePath(workspacePath);
    pathRef.current = filePath;
    let cancelled = false;

    void bridge()?.read(filePath)
      .then((data) => { if (!cancelled) setState(normalise(data)); })
      .catch(() => { if (!cancelled) setState(DEFAULTS); });

    return () => { cancelled = true; };
  }, [workspacePath]);

  // A patch, not a replacement: the divider and the AI marks are written by
  // different things at different times, and either would erase the other.
  const update = useCallback((patch: Partial<GitViewState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      const filePath = pathRef.current;
      if (filePath) void bridge()?.write(filePath, next).catch(() => {});
      return next;
    });
  }, []);

  return [state, update];
}
