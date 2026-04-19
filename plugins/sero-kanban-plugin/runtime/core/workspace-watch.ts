import type { Card, Column, KanbanState } from './types';
import type { OrchestratorDeps } from './orchestrator-types';

export interface WatchedWorkspaceEntry {
  workspaceId: string;
  stateFilePath: string;
  lastColumnMap: Map<string, Column>;
  lastCardMap: Map<string, Card>;
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
  deps: OrchestratorDeps | null,
  watched: Map<string, WatchedWorkspaceEntry>,
  stateFilePath: string,
  state: KanbanState | null,
): WatchedWorkspaceEntry | null {
  if (!deps || stateFilePath !== deps.stateFilePath) return null;

  console.log(`[kanban-runtime] Auto-watching "${deps.workspaceId}"`);
  const entry: WatchedWorkspaceEntry = {
    workspaceId: deps.workspaceId,
    stateFilePath,
    lastColumnMap: new Map((state?.cards ?? []).map((card) => [card.id, card.column])),
    lastCardMap: buildCardMap(state),
  };
  watched.set(deps.workspaceId, entry);
  return entry;
}
