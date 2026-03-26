import { appStateManager } from '../workspace/app-state';
import type { Card, Column, KanbanState } from './types';

export interface WatchedWorkspaceEntry {
  workspaceId: string;
  stateFilePath: string;
  lastColumnMap: Map<string, Column>;
  lastCardMap: Map<string, Card>;
}

interface WorkspaceLocatorDeps {
  findWorkspaceByPath: (absPath: string) => { id: string; path: string } | null;
}

export function buildCardMap(state: KanbanState | null): Map<string, Card> {
  return new Map((state?.cards ?? []).map((card) => [card.id, card]));
}

export function findWatchedWorkspace(
  watched: Map<string, WatchedWorkspaceEntry>,
  stateFilePath: string,
): WatchedWorkspaceEntry | null {
  for (const [, entry] of watched) {
    if (entry.stateFilePath === stateFilePath) return entry;
  }
  return null;
}

export function autoWatchWorkspace(
  deps: WorkspaceLocatorDeps | null,
  watched: Map<string, WatchedWorkspaceEntry>,
  stateFilePath: string,
  state: KanbanState | null,
): WatchedWorkspaceEntry | null {
  if (!deps) return null;
  const suffix = '/.sero/apps/kanban/state.json';
  const idx = stateFilePath.indexOf(suffix);
  if (idx === -1) return null;

  const workspacePath = stateFilePath.substring(0, idx);
  const ws = deps.findWorkspaceByPath(workspacePath);
  if (!ws) return null;

  console.log(`[kanban-orchestrator] Auto-watching "${ws.id}"`);
  const entry: WatchedWorkspaceEntry = {
    workspaceId: ws.id,
    stateFilePath,
    lastColumnMap: new Map((state?.cards ?? []).map((card) => [card.id, card.column])),
    lastCardMap: buildCardMap(state),
  };
  watched.set(ws.id, entry);
  appStateManager.watch(stateFilePath);
  return entry;
}
