/** KanbanOrchestrator — reacts to card column transitions, triggers automated phases. */
import path from 'path';
import type { Card, Column, KanbanState } from './types';
import { WorktreeManager } from '../worktree/worktree-manager';
import { AutoMergeMonitor } from '../quality/auto-merge-monitor';
import { applyReviewActionEffects } from '../review/actions';
import {
  autoWatchWorkspace,
  buildCardMap,
  findWatchedWorkspace,
  type WatchedWorkspaceEntry,
} from '../workspace/workspace-watch';
import { appStateManager } from '@electron/features/apps/state/manager';
import type { OrchestratorDeps } from './orchestrator-types';
import {
  recoverStuckCards,
  reconcileWatchedWorkspace,
  runDoneCleanup,
  runImplementationPhase,
  runPlanningPhase,
  runReviewPhase,
  type OrchestratorPhaseContext,
} from './orchestrator-phase-runners';

const RETRYABLE_COLUMNS = new Set<Column>(['planning', 'in-progress', 'review']);

function isRetryableColumn(column: Column): boolean {
  return RETRYABLE_COLUMNS.has(column);
}

export class KanbanOrchestrator {
  private readonly worktreeManager = new WorktreeManager();
  private readonly autoMergeMonitor = new AutoMergeMonitor();
  private deps: OrchestratorDeps | null = null;
  private watched = new Map<string, WatchedWorkspaceEntry>();
  private planningInProgress = new Set<string>();
  private implementationInProgress = new Set<string>();
  private reviewInProgress = new Set<string>();

  setDeps(deps: OrchestratorDeps): void {
    this.deps = deps;
  }

  async recoverStuckCards(workspaces: Array<{ id: string; path: string }>): Promise<void> {
    await recoverStuckCards(
      {
        deps: this.deps,
        handleTransition: (workspace, card, toColumn) => this.handleTransition(workspace, card, toColumn),
      },
      this.watched,
      (workspaceId, workspacePath) => this.watchWorkspace(workspaceId, workspacePath),
      workspaces,
    );
  }

  async watchWorkspace(workspaceId: string, workspacePath: string): Promise<void> {
    const stateFilePath = path.join(workspacePath, '.sero', 'apps', 'kanban', 'state.json');
    const existing = this.watched.get(workspaceId);
    if (existing?.stateFilePath === stateFilePath) return;
    if (existing) this.unwatchWorkspace(workspaceId);

    const initial = await appStateManager.read(stateFilePath) as KanbanState | null;
    const lastColumnMap = new Map<string, Column>();
    if (initial?.cards) {
      for (const card of initial.cards) {
        lastColumnMap.set(card.id, card.column);
      }
    }

    this.watched.set(workspaceId, {
      workspaceId,
      stateFilePath,
      lastColumnMap,
      lastCardMap: buildCardMap(initial),
    });
    appStateManager.watch(stateFilePath);
    console.log(`[kanban-orchestrator] Watching workspace ${workspaceId}`);
    await reconcileWatchedWorkspace(stateFilePath, lastColumnMap, initial);
    this.autoMergeMonitor.syncWorkspace(this.watched.get(workspaceId)!, initial);
  }

  unwatchWorkspace(workspaceId: string): void {
    const entry = this.watched.get(workspaceId);
    if (!entry) return;

    this.autoMergeMonitor.clearWorkspace(workspaceId);
    appStateManager.unwatch(entry.stateFilePath);
    this.watched.delete(workspaceId);
  }

  async onStateChange(stateFilePath: string, newState: KanbanState): Promise<void> {
    if (!this.deps) return;

    let workspace = findWatchedWorkspace(this.watched, stateFilePath);
    if (!workspace) {
      workspace = autoWatchWorkspace(this.deps, this.watched, stateFilePath, newState);
    }
    if (!workspace || !newState?.cards) return;

    this.autoMergeMonitor.syncWorkspace(workspace, newState);
    const workspacePath = this.deps.getWorkspacePath(workspace.workspaceId);

    for (const card of newState.cards) {
      await this.applyReviewEffectsIfNeeded(workspace, workspacePath, card);
      await this.handleCardStateChange(workspace, card);
    }

    this.refreshWatchedWorkspaceSnapshot(workspace, newState);
  }

  private async applyReviewEffectsIfNeeded(
    workspace: WatchedWorkspaceEntry,
    workspacePath: string | null,
    card: Card,
  ): Promise<void> {
    if (!workspacePath) return;

    const previousCard = workspace.lastCardMap.get(card.id);
    await applyReviewActionEffects({
      stateFilePath: workspace.stateFilePath,
      workspacePath,
      worktreeManager: this.worktreeManager,
    }, previousCard, card);
  }

  private async handleCardStateChange(
    workspace: WatchedWorkspaceEntry,
    card: Card,
  ): Promise<void> {
    const previousColumn = workspace.lastColumnMap.get(card.id);

    if (previousColumn && previousColumn !== card.column) {
      console.log(`[kanban-orchestrator] Transition: #${card.id} ${previousColumn} → ${card.column}`);
      await this.handleTransition(workspace, card, card.column);
      return;
    }

    if (!previousColumn) {
      if (card.column === 'planning' && card.status === 'agent-working') {
        await this.handleTransition(workspace, card, 'planning');
        return;
      }
      if (card.column === 'in-progress' && card.status === 'idle') {
        await this.handleTransition(workspace, card, 'in-progress');
      }
      return;
    }

    if (
      card.status === 'agent-working'
      && isRetryableColumn(card.column)
      && !this.isCurrentlyProcessing(card.id)
    ) {
      console.log(`[kanban-orchestrator] Retry: #${card.id} in ${card.column}`);
      await this.handleTransition(workspace, card, card.column);
    }
  }

  private refreshWatchedWorkspaceSnapshot(
    workspace: WatchedWorkspaceEntry,
    state: KanbanState,
  ): void {
    workspace.lastColumnMap.clear();
    for (const card of state.cards) {
      workspace.lastColumnMap.set(card.id, card.column);
    }
    workspace.lastCardMap = buildCardMap(state);
  }

  private getPhaseContext(): OrchestratorPhaseContext {
    return {
      deps: this.deps,
      worktreeManager: this.worktreeManager,
      processing: {
        planningInProgress: this.planningInProgress,
        implementationInProgress: this.implementationInProgress,
        reviewInProgress: this.reviewInProgress,
      },
      handleTransition: (workspace, card, toColumn) => this.handleTransition(workspace, card, toColumn),
      isCurrentlyProcessing: (cardId) => this.isCurrentlyProcessing(cardId),
    };
  }

  private async handleTransition(
    workspace: WatchedWorkspaceEntry,
    card: Card,
    toColumn: Column,
  ): Promise<void> {
    const phaseContext = this.getPhaseContext();

    switch (toColumn) {
      case 'planning':
        await runPlanningPhase(phaseContext, workspace, card);
        break;
      case 'in-progress':
        await runImplementationPhase(phaseContext, workspace, card);
        break;
      case 'review':
        if (card.status !== 'waiting-input') {
          await runReviewPhase(phaseContext, workspace, card);
        }
        break;
      case 'done':
        await runDoneCleanup(phaseContext, workspace, card);
        break;
    }
  }

  private isCurrentlyProcessing(cardId: string): boolean {
    return this.planningInProgress.has(cardId)
      || this.implementationInProgress.has(cardId)
      || this.reviewInProgress.has(cardId);
  }

  dispose(): void {
    for (const [workspaceId] of this.watched) {
      this.unwatchWorkspace(workspaceId);
    }
  }
}
