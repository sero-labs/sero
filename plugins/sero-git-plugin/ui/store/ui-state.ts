/**
 * The Git app's own view state — how you left the app laid out.
 *
 * Kept in its own file rather than in the repo state the extension owns: that
 * file is rewritten on every filesystem change in live mode, so writing view
 * state into it would race the extension and broadcast a repo-state change to
 * every git surface on each drag of the divider.
 *
 * Everything here is a choice the user made about what they want to see. None
 * of it is a fact about the repository, and none of it should have to be made
 * again on the next visit.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GitViewState {
  /** Height of the graph band, as a percentage of the app below the top bar. */
  graphHeightPct: number;
  /** The history band, folded away to its header. */
  graphCollapsed: boolean;
  /** The rail's three sections. */
  localOpen: boolean;
  remoteOpen: boolean;
  stashesOpen: boolean;
}

export const DEFAULT_GRAPH_HEIGHT_PCT = 38;
export const MIN_GRAPH_HEIGHT_PCT = 12;
export const MAX_GRAPH_HEIGHT_PCT = 80;

const DEFAULTS: GitViewState = {
  graphHeightPct: DEFAULT_GRAPH_HEIGHT_PCT,
  graphCollapsed: false,
  localOpen: true,
  remoteOpen: true,
  stashesOpen: true,
};

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

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * A file written by an older version is missing the newer keys, and a file
 * written by a newer one may carry keys this build does not know. Both are
 * ordinary: every field falls back to its default on its own.
 */
export function normaliseViewState(value: unknown): GitViewState {
  const stored = (value ?? {}) as Partial<GitViewState>;
  const pct = typeof stored.graphHeightPct === 'number' && Number.isFinite(stored.graphHeightPct)
    ? Math.min(MAX_GRAPH_HEIGHT_PCT, Math.max(MIN_GRAPH_HEIGHT_PCT, stored.graphHeightPct))
    : DEFAULTS.graphHeightPct;

  return {
    graphHeightPct: pct,
    graphCollapsed: boolOr(stored.graphCollapsed, DEFAULTS.graphCollapsed),
    localOpen: boolOr(stored.localOpen, DEFAULTS.localOpen),
    remoteOpen: boolOr(stored.remoteOpen, DEFAULTS.remoteOpen),
    stashesOpen: boolOr(stored.stashesOpen, DEFAULTS.stashesOpen),
  };
}

/**
 * Per-workspace view state. Reads once per workspace and writes back on change;
 * a missing or unreadable file is simply the default.
 */
export function useGitViewState(
  workspacePath: string,
): [GitViewState, (next: Partial<GitViewState>) => void] {
  const [state, setState] = useState<GitViewState>(DEFAULTS);
  const stateRef = useRef<GitViewState>(DEFAULTS);
  const pathRef = useRef<string | null>(null);

  const apply = useCallback((next: GitViewState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!workspacePath) return;
    const filePath = viewStatePath(workspacePath);
    pathRef.current = filePath;
    let cancelled = false;

    void bridge()?.read(filePath)
      .then((data) => { if (!cancelled) apply(normaliseViewState(data)); })
      .catch(() => { if (!cancelled) apply(DEFAULTS); });

    return () => { cancelled = true; };
  }, [apply, workspacePath]);

  // A partial update, so a caller changing one thing cannot silently reset the
  // rest — which is what a whole-object setter invites once there is more than
  // one field.
  const update = useCallback((next: Partial<GitViewState>) => {
    const merged = { ...stateRef.current, ...next };
    apply(merged);
    const filePath = pathRef.current;
    if (filePath) void bridge()?.write(filePath, merged).catch(() => {});
  }, [apply]);

  return [state, update];
}
