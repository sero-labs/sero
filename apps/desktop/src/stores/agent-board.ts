/**
 * Agent Board store - cross-workspace aggregation of agent work.
 *
 * Reads are push-only: for every registered workspace the store watches the
 * orchestrator's loop index through the `window.sero.appState` bridge (it
 * accepts arbitrary absolute paths). GitHub issues/PRs are external state, so
 * they are fetched on every board mount and on explicit refresh — never
 * polled. Writes route through the single `sero:orchestrator:action` seam.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  ARCHITECT_APP_ID,
  ORCHESTRATOR_INDEX_FILE,
  ORCHESTRATOR_ROOM_INDEX_FILE,
  attentionSentence,
  loopAttention,
  projectAttention,
  roomAttention,
  sessionStartedAt,
  type ArchitectIndexView,
  type AttentionClaim,
  type GitDiffStat,
  type OrchestratorBoardAction,
  type OrchestratorBoardActionResult,
  type OrchestratorBoardIndexView,
  type OrchestratorBoardRoomIndexView,
} from '@sero-ai/common';
import type { BoardArchiveEntry, BoardColumnId, BoardLayoutState, WorkspaceBoardSlice } from '@/types/board';
import type { BoardCard } from '@/components/apps/board/board-model';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import { persistLayout } from '@/lib/persist-layout';

const EMPTY_SLICE: WorkspaceBoardSlice = { index: null, rooms: null, issues: [], openPrs: [] };

/** This renderer session, the anchor a live-run mark is judged against. */
const SESSION_STARTED_AT = sessionStartedAt();

interface AgentBoardState {
  /** Aggregated per-workspace state (watched files + fetched gh reads). */
  slices: Record<string, WorkspaceBoardSlice>;
  /**
   * The Architect's global project index, null until it is read. Its projects
   * name their own workspace, so it is watched once rather than per workspace.
   */
  architect: ArchitectIndexView | null;
  /** True once watchers are attached (board mounted at least once). */
  started: boolean;
  /** In-flight guard for the gh fetch sweep. */
  refreshingIssues: boolean;
  /** Cached diff stats keyed by checkout path; `key` invalidates on loop update. */
  diffStats: Record<string, { key: string; stat: GitDiffStat | null }>;
  collapsedColumns: BoardColumnId[];
  workspaceFilter: string | null;
  archived: BoardArchiveEntry[];
  deletedKeys: string[];
  restoredKeys: string[];

  /** Attach the watchers only. The workspace tree calls this on mount. */
  startWatching: () => void;
  start: () => void;
  refreshIssues: () => Promise<void>;
  requestAction: (
    workspaceId: string,
    action: OrchestratorBoardAction,
  ) => Promise<OrchestratorBoardActionResult>;
  fetchDiffStat: (checkoutPath: string, cacheKey: string) => void;
  toggleColumn: (column: BoardColumnId) => void;
  setWorkspaceFilter: (workspaceId: string | null) => void;
  archiveCard: (card: BoardCard) => void;
  restoreCard: (key: string) => void;
  deleteArchived: (key: string) => void;
  hydrate: (layout: BoardLayoutState | undefined) => void;
}

/** What a watched file is: three shapes, two of them per workspace. */
type WatchKind = 'loops' | 'rooms' | 'architect';

/** Absolute index path → what it is and whose. Module-level: survives store updates. */
const watchTargets = new Map<string, { workspaceId: string; kind: WatchKind }>();
let changeUnsubscribe: (() => void) | null = null;
let workspaceUnsubscribe: (() => void) | null = null;
let appsUnsubscribe: (() => void) | null = null;

function indexPath(workspacePath: string): string {
  return `${workspacePath}/${ORCHESTRATOR_INDEX_FILE}`;
}

function roomIndexPath(workspacePath: string): string {
  return `${workspacePath}/${ORCHESTRATOR_ROOM_INDEX_FILE}`;
}

function normalizeIndex(data: unknown): OrchestratorBoardIndexView | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { loops?: unknown }).loops)) {
    return null;
  }
  return data as OrchestratorBoardIndexView;
}

function normalizeRoomIndex(data: unknown): OrchestratorBoardRoomIndexView | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { rooms?: unknown }).rooms)) {
    return null;
  }
  return data as OrchestratorBoardRoomIndexView;
}

function normalizeArchitectIndex(data: unknown): ArchitectIndexView | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { projects?: unknown }).projects)) {
    return null;
  }
  return data as ArchitectIndexView;
}

/**
 * The state bridge, or null when there is none.
 *
 * The workspace subscription below outlives any one screen, so it must not
 * throw when it runs without a bridge; it simply watches nothing.
 */
function appStateBridge(): Window['sero']['appState'] | null {
  return window.sero?.appState ?? null;
}

/** Where the Architect keeps its index, or null before app discovery finishes. */
function architectIndexPath(): string | null {
  const app = useAppStore.getState().apps.find((entry) => entry.id === ARCHITECT_APP_ID);
  return app?.manifest?.globalStatePath ?? null;
}

export const useAgentBoardStore = create<AgentBoardState>((set, get) => {
  function applyWatched(workspaceId: string, kind: WatchKind, data: unknown): void {
    if (kind === 'architect') {
      set({ architect: normalizeArchitectIndex(data) });
      return;
    }
    set((state) => {
      const slice = state.slices[workspaceId] ?? EMPTY_SLICE;
      const next: WorkspaceBoardSlice = kind === 'loops'
        ? { ...slice, index: normalizeIndex(data) }
        : { ...slice, rooms: normalizeRoomIndex(data) };
      return { slices: { ...state.slices, [workspaceId]: next } };
    });
  }

  function watchPath(filePath: string, workspaceId: string, kind: WatchKind): void {
    const bridge = appStateBridge();
    if (!bridge || watchTargets.has(filePath)) return;
    watchTargets.set(filePath, { workspaceId, kind });
    bridge
      .watch(filePath)
      .then(({ data }: { data: unknown }) => applyWatched(workspaceId, kind, data))
      .catch(() => applyWatched(workspaceId, kind, null));
  }

  /** Aligns watchers with the current workspace list (idempotent, push-driven). */
  function syncWatchers(): void {
    const bridge = appStateBridge();
    if (!bridge) return;
    const workspaces = useWorkspaceStore.getState().workspaces;
    const wanted = new Map<string, { workspaceId: string; kind: WatchKind }>();
    for (const ws of workspaces) {
      if (!ws.path) continue;
      wanted.set(indexPath(ws.path), { workspaceId: ws.id, kind: 'loops' });
      wanted.set(roomIndexPath(ws.path), { workspaceId: ws.id, kind: 'rooms' });
    }
    const architectPath = architectIndexPath();
    if (architectPath) wanted.set(architectPath, { workspaceId: '', kind: 'architect' });
    for (const [filePath] of watchTargets) {
      if (wanted.has(filePath)) continue;
      watchTargets.delete(filePath);
      void bridge.unwatch(filePath).catch(() => undefined);
    }
    for (const [filePath, target] of wanted) watchPath(filePath, target.workspaceId, target.kind);
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
    architect: null,
    started: false,
    refreshingIssues: false,
    diffStats: {},
    collapsedColumns: [],
    workspaceFilter: null,
    archived: [],
    deletedKeys: [],
    restoredKeys: [],

    startWatching: () => {
      if (!get().started) {
        set({ started: true });
        changeUnsubscribe ??= appStateBridge()?.onChange((filePath: string, data: unknown) => {
          const target = watchTargets.get(filePath);
          if (target) applyWatched(target.workspaceId, target.kind, data);
        }) ?? null;
        // Workspaces added/removed while the board is up re-align the watcher set.
        workspaceUnsubscribe ??= useWorkspaceStore.subscribe((state, prev) => {
          if (state.workspaces !== prev.workspaces) syncWatchers();
        });
        // App discovery finishes after the tree mounts, and it carries the
        // Architect's index path.
        appsUnsubscribe ??= useAppStore.subscribe((state, prev) => {
          if (state.apps !== prev.apps) syncWatchers();
        });
      }
      syncWatchers();
    },

    start: () => {
      get().startWatching();
      // Every mount refetches gh state, so a reopened board isn't stale.
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

    archiveCard: (card) => {
      if (get().deletedKeys.includes(card.key) || get().archived.some((entry) => entry.key === card.key)) return;
      const entry: BoardArchiveEntry = {
        key: card.key,
        kind: card.kind,
        title: card.kind === 'issue' ? `#${card.issue.number} ${card.issue.title}`
          : card.kind === 'loop' ? card.loop.title
          : card.kind === 'room' ? card.room.title : card.title,
        workspaceId: card.workspaceId,
        workspaceName: card.workspaceName,
        archivedAt: new Date().toISOString(),
      };
      const archived = [entry, ...get().archived];
      set({ archived });
      persistLayout({ boardLayout: buildBoardLayout({ archived }) });
    },

    restoreCard: (key) => {
      const entry = get().archived.find((item) => item.key === key);
      if (!entry || get().deletedKeys.includes(key)) return;
      const archived = get().archived.filter((item) => item.key !== key);
      const restoredKeys = [...new Set([...get().restoredKeys, key])];
      set({ archived, restoredKeys });
      persistLayout({ boardLayout: buildBoardLayout({ archived, restoredKeys }) });
    },

    deleteArchived: (key) => {
      if (!get().archived.some((item) => item.key === key)) return;
      const archived = get().archived.filter((item) => item.key !== key);
      const deletedKeys = [...new Set([...get().deletedKeys, key])];
      const restoredKeys = get().restoredKeys.filter((item) => item !== key);
      set({ archived, deletedKeys, restoredKeys });
      persistLayout({ boardLayout: buildBoardLayout({ archived, deletedKeys, restoredKeys }) });
    },

    hydrate: (layout) => {
      if (!layout) return;
      set({
        collapsedColumns: layout.collapsedColumns ?? [],
        workspaceFilter: layout.workspaceFilter ?? null,
        archived: Array.isArray(layout.archived) ? layout.archived : [],
        deletedKeys: Array.isArray(layout.deletedKeys) ? layout.deletedKeys : [],
        restoredKeys: Array.isArray(layout.restoredKeys) ? layout.restoredKeys : [],
      });
    },
  };
});

/**
 * The one thing in this workspace that needs the user, or null.
 *
 * It reads only records the apps already publish, so a workspace whose indexes
 * have not been read says nothing rather than claiming its work is fine. The
 * first claim wins: the tree shows one icon, and a project's own words are more
 * use than the Workflow underneath it.
 */
export interface WorkspaceAttention {
  /** The state the owning app is in, for the glyph. */
  state: AttentionClaim['state'];
  /** What needs the user, named and worded as its own app words it. */
  sentence: string;
  /** The Architect project that raised it, so the icon can open that project. */
  projectId?: string;
}

export function workspaceAttention(
  state: Pick<AgentBoardState, 'slices' | 'architect'>,
  workspaceId: string,
): WorkspaceAttention | null {
  const named = (title: string, claim: AttentionClaim | null): WorkspaceAttention | null =>
    (claim ? { state: claim.state, sentence: `${title}: ${attentionSentence(claim)}` } : null);

  for (const project of state.architect?.projects ?? []) {
    if (project.workspaceId !== workspaceId) continue;
    const found = named(project.name, projectAttention(project));
    if (found) return { ...found, projectId: project.id };
  }
  const slice = state.slices[workspaceId];
  for (const loop of slice?.index?.loops ?? []) {
    const found = named(loop.title, loopAttention(loop, SESSION_STARTED_AT));
    if (found) return found;
  }
  for (const room of slice?.rooms?.rooms ?? []) {
    const found = named(room.title, roomAttention(room));
    if (found) return found;
  }
  return null;
}

/** Subscribes to the one sentence, so an unrelated index write re-renders nothing. */
export function useWorkspaceAttention(workspaceId: string): WorkspaceAttention | null {
  return useAgentBoardStore(useShallow((state) => workspaceAttention(state, workspaceId)));
}

/** Current board prefs merged with a partial update (for persistLayout). */
function buildBoardLayout(partial: Partial<BoardLayoutState>): BoardLayoutState {
  const state = useAgentBoardStore.getState();
  return {
    collapsedColumns: partial.collapsedColumns ?? state.collapsedColumns,
    workspaceFilter:
      partial.workspaceFilter !== undefined ? partial.workspaceFilter : state.workspaceFilter,
    archived: partial.archived ?? state.archived,
    deletedKeys: partial.deletedKeys ?? state.deletedKeys,
    restoredKeys: partial.restoredKeys ?? state.restoredKeys,
  };
}
