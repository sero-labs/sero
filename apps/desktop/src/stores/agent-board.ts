/**
 * Agent Board store — cross-workspace aggregation of agent work
 * (docs/features/agent-board/plan.md).
 *
 * Reads are push-only: for every registered workspace the store watches the
 * orchestrator's loop index and the git app's state file through the
 * `window.sero.appState` bridge (it accepts arbitrary absolute paths). GitHub
 * issues/PRs are external state, so they are fetched on board mount and on
 * explicit refresh — never polled. Writes route through the single
 * `sero:orchestrator:action` seam.
 */

import { create } from 'zustand';
import {
  ORCHESTRATOR_INDEX_FILE,
  type GitDiffStat,
  type OrchestratorBoardAction,
  type OrchestratorBoardActionResult,
  type OrchestratorBoardIndexView,
} from '@sero-ai/common';
import type { BoardColumnId, BoardGitState, BoardLayoutState, WorkspaceBoardSlice } from '@/types/board';
import { useWorkspaceStore } from '@/stores/workspace';
import { persistLayout } from '@/lib/persist-layout';

/** Written by the git plugin's extension; the board reads a structural subset. */
const GIT_STATE_FILE = '.sero/apps/git/state.json';

const EMPTY_SLICE: WorkspaceBoardSlice = { index: null, git: null, issues: [], openPrs: [] };

interface WatchTarget {
  workspaceId: string;
  field: 'index' | 'git';
}

interface AgentBoardState {
  /** Aggregated per-workspace state (watched files + fetched gh reads). */
  slices: Record<string, WorkspaceBoardSlice>;
  /** True once watchers are attached (board mounted at least once). */
  started: boolean;
  /** In-flight guard for the gh fetch sweep. */
  refreshingIssues: boolean;
  /** Cached diff stats keyed by checkout path; `key` invalidates on loop update. */
  diffStats: Record<string, { key: string; stat: GitDiffStat | null }>;
  collapsedColumns: BoardColumnId[];
  workspaceFilter: string | null;

  start: () => void;
  refreshIssues: () => Promise<void>;
  requestAction: (
    workspaceId: string,
    action: OrchestratorBoardAction,
  ) => Promise<OrchestratorBoardActionResult>;
  fetchDiffStat: (checkoutPath: string, cacheKey: string) => void;
  toggleColumn: (column: BoardColumnId) => void;
  setWorkspaceFilter: (workspaceId: string | null) => void;
  hydrate: (layout: BoardLayoutState | undefined) => void;
}

/** Absolute path → which slice field it feeds. Module-level: survives store updates. */
const watchTargets = new Map<string, WatchTarget>();
let changeUnsubscribe: (() => void) | null = null;
let workspaceUnsubscribe: (() => void) | null = null;

function indexPath(workspacePath: string): string {
  return `${workspacePath}/${ORCHESTRATOR_INDEX_FILE}`;
}

function gitStatePath(workspacePath: string): string {
  return `${workspacePath}/${GIT_STATE_FILE}`;
}

function normalizeIndex(data: unknown): OrchestratorBoardIndexView | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { loops?: unknown }).loops)) {
    return null;
  }
  return data as OrchestratorBoardIndexView;
}

function normalizeGit(data: unknown): BoardGitState | null {
  if (!data || typeof data !== 'object') return null;
  return data as BoardGitState;
}

export const useAgentBoardStore = create<AgentBoardState>((set, get) => {
  function applyWatched(target: WatchTarget, data: unknown): void {
    set((state) => {
      const slice = state.slices[target.workspaceId] ?? EMPTY_SLICE;
      const next: WorkspaceBoardSlice =
        target.field === 'index'
          ? { ...slice, index: normalizeIndex(data) }
          : { ...slice, git: normalizeGit(data) };
      return { slices: { ...state.slices, [target.workspaceId]: next } };
    });
  }

  function watchPath(filePath: string, target: WatchTarget): void {
    if (watchTargets.has(filePath)) return;
    watchTargets.set(filePath, target);
    window.sero.appState
      .watch(filePath)
      .then((data: unknown) => applyWatched(target, data))
      .catch(() => applyWatched(target, null));
  }

  /** Aligns watchers with the current workspace list (idempotent, push-driven). */
  function syncWatchers(): void {
    const workspaces = useWorkspaceStore.getState().workspaces;
    const wanted = new Map<string, WatchTarget>();
    for (const ws of workspaces) {
      if (!ws.path) continue;
      wanted.set(indexPath(ws.path), { workspaceId: ws.id, field: 'index' });
      wanted.set(gitStatePath(ws.path), { workspaceId: ws.id, field: 'git' });
    }
    for (const [filePath] of watchTargets) {
      if (wanted.has(filePath)) continue;
      watchTargets.delete(filePath);
      void window.sero.appState.unwatch(filePath).catch(() => undefined);
    }
    for (const [filePath, target] of wanted) watchPath(filePath, target);
    // Drop slices of workspaces that no longer exist.
    set((state) => {
      const ids = new Set(workspaces.map((ws) => ws.id));
      const kept = Object.entries(state.slices).filter(([id]) => ids.has(id));
      if (kept.length === Object.keys(state.slices).length) return state;
      return { slices: Object.fromEntries(kept) };
    });
  }

  return {
    slices: {},
    started: false,
    refreshingIssues: false,
    diffStats: {},
    collapsedColumns: [],
    workspaceFilter: null,

    start: () => {
      if (get().started) {
        syncWatchers();
        return;
      }
      set({ started: true });
      changeUnsubscribe ??= window.sero.appState.onChange((filePath: string, data: unknown) => {
        const target = watchTargets.get(filePath);
        if (target) applyWatched(target, data);
      });
      // Workspaces added/removed while the board is up re-align the watcher set.
      workspaceUnsubscribe ??= useWorkspaceStore.subscribe((state, prev) => {
        if (state.workspaces !== prev.workspaces) syncWatchers();
      });
      syncWatchers();
      void get().refreshIssues();
    },

    refreshIssues: async () => {
      if (get().refreshingIssues) return;
      set({ refreshingIssues: true });
      try {
        const workspaces = useWorkspaceStore.getState().workspaces.filter((ws) => ws.path);
        await Promise.all(
          workspaces.map(async (ws) => {
            const [issues, openPrs] = await Promise.all([
              window.sero.vcs.issues(ws.id).catch(() => []),
              window.sero.vcs.openPrs(ws.id).catch(() => []),
            ]);
            set((state) => {
              const slice = state.slices[ws.id] ?? EMPTY_SLICE;
              return { slices: { ...state.slices, [ws.id]: { ...slice, issues, openPrs } } };
            });
          }),
        );
      } finally {
        set({ refreshingIssues: false });
      }
    },

    requestAction: (workspaceId, action) =>
      window.sero.orchestrator.requestAction(workspaceId, action),

    fetchDiffStat: (checkoutPath, cacheKey) => {
      const cached = get().diffStats[checkoutPath];
      if (cached?.key === cacheKey) return;
      // Optimistically mark the key so concurrent renders don't re-request.
      set((state) => ({
        diffStats: {
          ...state.diffStats,
          [checkoutPath]: { key: cacheKey, stat: cached?.stat ?? null },
        },
      }));
      window.sero.vcs
        .diffStat(checkoutPath)
        .then((stat) => {
          set((state) => ({
            diffStats: { ...state.diffStats, [checkoutPath]: { key: cacheKey, stat } },
          }));
        })
        .catch(() => undefined);
    },

    toggleColumn: (column) => {
      const current = get().collapsedColumns;
      const collapsedColumns = current.includes(column)
        ? current.filter((c) => c !== column)
        : [...current, column];
      set({ collapsedColumns });
      persistLayout({ boardLayout: buildBoardLayout({ collapsedColumns }) });
    },

    setWorkspaceFilter: (workspaceId) => {
      set({ workspaceFilter: workspaceId });
      persistLayout({ boardLayout: buildBoardLayout({ workspaceFilter: workspaceId }) });
    },

    hydrate: (layout) => {
      if (!layout) return;
      set({
        collapsedColumns: layout.collapsedColumns ?? [],
        workspaceFilter: layout.workspaceFilter ?? null,
      });
    },
  };
});

/** Current board prefs merged with a partial update (for persistLayout). */
function buildBoardLayout(partial: Partial<BoardLayoutState>): BoardLayoutState {
  const state = useAgentBoardStore.getState();
  return {
    collapsedColumns: partial.collapsedColumns ?? state.collapsedColumns,
    workspaceFilter:
      partial.workspaceFilter !== undefined ? partial.workspaceFilter : state.workspaceFilter,
  };
}
