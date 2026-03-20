/** KanbanOrchestrator — reacts to card column transitions, triggers automated phases. */
import path from 'path';
import type { KanbanState, Card, Column } from './types';
import { WorktreeManager } from './worktree-manager';
import { PlanningProgressTracker } from './planning-progress';
import { ImplementationProgressTracker } from './implementation-progress';
import { ReviewProgressTracker } from './review-progress';
import { AutoMergeMonitor, buildAutoMergePendingMessage } from './auto-merge-monitor';
import { executeReview } from './review-executor';
import { getPullRequestMergeError } from './pr-merge-status';
import { executePlanning } from './planning-executor';
import { executeImplementation } from './implementation-executor';
import { cleanupCardReviewPreview } from './review-preview';
import { updateCard, readCard } from './state-helpers';
import { isYoloModeEnabled, reconcilePersistedState, runWorkspaceMaintenance } from './orchestrator-helpers';
import { validateTransition, getNewlyUnblockedCards, getAllReadyBacklogCards } from './contracts';
import { mergePrFromWorktree } from './worktree-pr';
import { autoWatchWorkspace, findWatchedWorkspace, type WatchedWorkspaceEntry } from './workspace-watch';
import { appStateManager } from '../app-state';
import type { SubagentManager } from '../subagent/index';
const RETRYABLE_COLUMNS = new Set<Column>(['planning', 'in-progress', 'review']);
function isRetryableColumn(column: Column): boolean { return RETRYABLE_COLUMNS.has(column); }

interface OrchestratorDeps {
  subagentManager: SubagentManager;
  getWorkspacePath: (workspaceId: string) => string | null;
  findWorkspaceByPath: (absPath: string) => { id: string; path: string } | null;
}

export class KanbanOrchestrator {
  private readonly worktreeManager = new WorktreeManager();
  private readonly autoMergeMonitor = new AutoMergeMonitor();
  private deps: OrchestratorDeps | null = null;
  private watched = new Map<string, WatchedWorkspaceEntry>();
  private planningInProgress = new Set<string>();
  private implementationInProgress = new Set<string>();
  private reviewInProgress = new Set<string>();

  setDeps(deps: OrchestratorDeps): void { this.deps = deps; }

  async recoverStuckCards(workspaces: Array<{ id: string; path: string }>): Promise<void> {
    if (!this.deps) return;
    const KANBAN_SUFFIX = path.join('.sero', 'apps', 'kanban', 'state.json');
    let recovered = 0;
    for (const ws of workspaces) {
      const stateFilePath = path.join(ws.path, KANBAN_SUFFIX);
      let state: KanbanState | null;
      try {
        state = await appStateManager.read(stateFilePath) as KanbanState | null;
      } catch {
        continue;
      }
      if (!state?.cards) continue;
      const stuckCards = state.cards.filter(
        (c) => c.status === 'agent-working' && isRetryableColumn(c.column),
      );
      if (stuckCards.length === 0) continue;
      if (!this.watched.has(ws.id)) {
        await this.watchWorkspace(ws.id, ws.path);
      }
      for (const card of stuckCards) {
        console.log(`[kanban-orchestrator] Recovery: card #${card.id} stuck in ${card.column} — retrying`);
        recovered++;
        await this.handleTransition(this.watched.get(ws.id)!, card, card.column);
      }
    }
    if (recovered > 0) {
      console.log(`[kanban-orchestrator] Recovery: retried ${recovered} stuck card(s)`);
    }
  }

  async watchWorkspace(workspaceId: string, workspacePath: string): Promise<void> {
    const stateFilePath = path.join(workspacePath, '.sero', 'apps', 'kanban', 'state.json');
    const initial = await appStateManager.read(stateFilePath) as KanbanState | null;
    const lastColumnMap = new Map<string, Column>();
    if (initial?.cards) {
      for (const card of initial.cards) {
        lastColumnMap.set(card.id, card.column);
      }
    }
    this.watched.set(workspaceId, { workspaceId, stateFilePath, lastColumnMap });
    appStateManager.watch(stateFilePath);
    console.log(`[kanban-orchestrator] Watching workspace ${workspaceId}`);
    await reconcilePersistedState(stateFilePath, this.watched.get(workspaceId)!.lastColumnMap, initial);
    this.autoMergeMonitor.syncWorkspace(this.watched.get(workspaceId)!, initial);
  }

  unwatchWorkspace(workspaceId: string): void {
    const entry = this.watched.get(workspaceId);
    if (entry) {
      this.autoMergeMonitor.clearWorkspace(workspaceId);
      appStateManager.unwatch(entry.stateFilePath);
      this.watched.delete(workspaceId);
    }
  }

  async onStateChange(stateFilePath: string, newState: KanbanState): Promise<void> {
    if (!this.deps) return;

    let workspace = findWatchedWorkspace(this.watched, stateFilePath);
    if (!workspace) workspace = autoWatchWorkspace(this.deps, this.watched, stateFilePath);
    if (!workspace || !newState?.cards) return;
    this.autoMergeMonitor.syncWorkspace(workspace, newState);

    for (const card of newState.cards) {
      const prevColumn = workspace.lastColumnMap.get(card.id);

      if (prevColumn && prevColumn !== card.column) {
        console.log(`[kanban-orchestrator] Transition: #${card.id} ${prevColumn} → ${card.column}`);
        await this.handleTransition(workspace, card, card.column);
      } else if (!prevColumn) {
        if (card.column === 'planning' && card.status === 'agent-working') {
          await this.handleTransition(workspace, card, 'planning');
        } else if (card.column === 'in-progress' && card.status === 'idle') {
          await this.handleTransition(workspace, card, 'in-progress');
        }
      } else if (
        card.status === 'agent-working'
        && isRetryableColumn(card.column)
        && !this.isCurrentlyProcessing(card.id)
      ) {
        console.log(`[kanban-orchestrator] Retry: #${card.id} in ${card.column}`);
        await this.handleTransition(workspace, card, card.column);
      }
    }

    workspace.lastColumnMap.clear();
    for (const card of newState.cards) {
      workspace.lastColumnMap.set(card.id, card.column);
    }
  }

  private async handleTransition(
    workspace: WatchedWorkspaceEntry,
    card: Card,
    toColumn: Column,
  ): Promise<void> {
    switch (toColumn) {
      case 'planning':
        await this.runPlanningPhase(workspace, card);
        break;
      case 'in-progress':
        await this.runImplementationPhase(workspace, card);
        break;
      case 'review':
        if (card.status !== 'waiting-input') await this.runReviewPhase(workspace, card);
        break;
      case 'done':
        await this.runDoneCleanup(workspace, card);
        break;
    }
  }

  private async runPlanningPhase(workspace: WatchedWorkspaceEntry, card: Card): Promise<void> {
    if (!this.deps || this.planningInProgress.has(card.id)) return;
    this.planningInProgress.add(card.id);

    const workspacePath = this.deps.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) { this.planningInProgress.delete(card.id); return; }

    const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    if (currentState) {
      const validation = validateTransition(card, 'planning', currentState);
      if (!validation.valid) {
        await updateCard(workspace.stateFilePath, card.id, {
          status: 'failed',
          column: 'backlog',
          error: `Cannot start planning: ${validation.errors.join('; ')}`,
        });
        this.planningInProgress.delete(card.id);
        return;
      }
    }
    await runWorkspaceMaintenance(
      workspace.workspaceId,
      workspace.stateFilePath,
      workspacePath,
      currentState,
      this.worktreeManager,
    );

    const tracker = new PlanningProgressTracker(workspace.stateFilePath, card.id, updateCard);

    try {
      await updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

      const { worktreePath, branchName, greenfield } = await this.worktreeManager.create(
        workspacePath, card.id, card.title,
      );
      await updateCard(workspace.stateFilePath, card.id, { branch: branchName, worktreePath });

      const settingsState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
      const planResult = await executePlanning({
        subagentManager: this.deps.subagentManager,
        workspaceId: workspace.workspaceId,
        planOptions: { testingEnabled: settingsState?.settings?.testingEnabled },
      }, card, tracker, greenfield);

      await tracker.clear();

      const yolo = await isYoloModeEnabled(workspace.stateFilePath);
      const planUpdate = { plan: planResult.plan, subtasks: planResult.subtasks, planningProgress: undefined };

      if (yolo) {
        workspace.lastColumnMap.set(card.id, 'in-progress');
        await updateCard(workspace.stateFilePath, card.id, { ...planUpdate, status: 'idle', column: 'in-progress' });
        console.log(`[kanban-orchestrator] Card #${card.id} planning complete — YOLO auto-approved`);
        const approved = await readCard(workspace.stateFilePath, card.id);
        if (approved) {
          await this.handleTransition(workspace, approved, 'in-progress');
        }
      } else {
        await updateCard(workspace.stateFilePath, card.id, { ...planUpdate, status: 'waiting-input' });
        console.log(`[kanban-orchestrator] Card #${card.id} planning complete — waiting for approval`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Planning failed for card #${card.id}:`, errMsg);
      await tracker.clear();
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed', error: `Planning failed: ${errMsg}`, planningProgress: undefined,
      });
    } finally {
      this.planningInProgress.delete(card.id);
    }
  }

  private async runImplementationPhase(workspace: WatchedWorkspaceEntry, card: Card): Promise<void> {
    if (!this.deps || this.implementationInProgress.has(card.id)) return;
    this.implementationInProgress.add(card.id);

    const workspacePath = this.deps.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) { this.implementationInProgress.delete(card.id); return; }

    // Re-read card to get latest subtasks/worktreePath
    const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    const freshCard = currentState?.cards.find((c) => c.id === card.id);
    if (!freshCard) { this.implementationInProgress.delete(card.id); return; }

    const worktreePath = freshCard.worktreePath;
    if (!worktreePath) {
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed', error: 'No worktree path — was planning phase completed?',
      });
      this.implementationInProgress.delete(card.id);
      return;
    }

    const tracker = new ImplementationProgressTracker(workspace.stateFilePath, card.id, updateCard);

    try {
      console.log(`[kanban-orchestrator] Starting implementation for card #${card.id}`);
      await updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

      // Reset all subtasks to pending
      const subtasks = freshCard.subtasks.map((s) => ({ ...s, status: 'pending' as const }));
      await updateCard(workspace.stateFilePath, card.id, { subtasks });

      console.log(
        `[kanban-orchestrator] Card #${card.id}: single implementer executing ${subtasks.length} planned subtask(s)`,
      );

      // Read settings for testing/review config
      const stateForSettings = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
      const settings = stateForSettings?.settings;

      await executeImplementation(
        { subagentManager: this.deps.subagentManager, workspaceId: workspace.workspaceId, settings },
        workspace.stateFilePath, freshCard, worktreePath, tracker,
      );

      // All done — advance to review
      await tracker.clear();
      workspace.lastColumnMap.set(card.id, 'review');
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'idle',
        column: 'review',
        implementationProgress: undefined,
      });
      console.log(`[kanban-orchestrator] Card #${card.id} impl complete → Review`);
      // Chain to review — updateCard bypasses IPC so we must trigger explicitly
      const reviewCard = await readCard(workspace.stateFilePath, card.id);
      if (reviewCard) {
        await this.handleTransition(workspace, reviewCard, 'review');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Implementation failed for card #${card.id}:`, errMsg);
      await tracker.clear();
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        error: `Implementation failed: ${errMsg}`,
        implementationProgress: undefined,
      });
    } finally {
      this.implementationInProgress.delete(card.id);
    }
  }

  private async runReviewPhase(workspace: WatchedWorkspaceEntry, card: Card): Promise<void> {
    if (!this.deps || this.reviewInProgress.has(card.id)) return;
    this.reviewInProgress.add(card.id);

    const workspacePath = this.deps.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) { this.reviewInProgress.delete(card.id); return; }

    const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    const freshCard = currentState?.cards.find((c) => c.id === card.id);
    if (!freshCard) { this.reviewInProgress.delete(card.id); return; }

    const worktreePath = freshCard.worktreePath;
    const branchName = freshCard.branch;
    if (!worktreePath || !branchName) {
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed', error: 'No worktree/branch — was implementation phase completed?',
      });
      this.reviewInProgress.delete(card.id);
      return;
    }

    const tracker = new ReviewProgressTracker(workspace.stateFilePath, card.id, updateCard);

    try {
      console.log(`[kanban-orchestrator] Starting review for card #${card.id}`);
      const previewCleanup = await cleanupCardReviewPreview(workspace.workspaceId, card.id);
      if (previewCleanup.reason) {
        console.log(`[kanban-orchestrator] Preview cleanup note for card #${card.id}: ${previewCleanup.reason}`);
      }
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'agent-working',
        error: undefined,
        previewServerId: undefined,
        previewUrl: undefined,
      });

      const reviewState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
      const result = await executeReview({
        subagentManager: this.deps.subagentManager,
        workspaceId: workspace.workspaceId,
        settings: reviewState?.settings,
      }, freshCard, worktreePath, branchName, tracker);

      await tracker.clear();

      if (result.success) {
        const yolo = await isYoloModeEnabled(workspace.stateFilePath);
        const autoMergePrs = reviewState?.settings?.yoloAutoMergePrs === true;
        const prNumber = result.prNumber;
        const prUpdate = {
          prUrl: result.prUrl,
          prNumber,
          previewServerId: result.previewServerId,
          previewUrl: result.previewUrl,
          reviewFilePath: result.reviewFilePath,
          reviewProgress: undefined,
          error: undefined,
        };

        if (yolo && autoMergePrs && typeof prNumber === 'number' && prNumber > 0) {
          const mergeResult = await mergePrFromWorktree(worktreePath, prNumber, { method: 'squash' });
          if (!mergeResult.success) {
            await updateCard(workspace.stateFilePath, card.id, {
              ...prUpdate,
              status: 'waiting-input',
              error: `Auto-merge failed: ${mergeResult.error}`,
            });
            console.log(`[kanban-orchestrator] Card #${card.id} auto-merge failed: ${mergeResult.error}`);
          } else if (mergeResult.state === 'merged') {
            workspace.lastColumnMap.set(card.id, 'done');
            await updateCard(workspace.stateFilePath, card.id, { ...prUpdate, status: 'idle', column: 'done', completedAt: new Date().toISOString() });
            console.log(`[kanban-orchestrator] Card #${card.id} YOLO auto-merged: ${result.prUrl}`);
            await this.runDoneCleanup(workspace, card);
          } else {
            await updateCard(workspace.stateFilePath, card.id, {
              ...prUpdate,
              status: 'waiting-input',
              error: buildAutoMergePendingMessage(prNumber),
            });
            console.log(`[kanban-orchestrator] Card #${card.id} queued for GitHub auto-merge: ${result.prUrl}`);
          }
        } else if (yolo && autoMergePrs) {
          await updateCard(workspace.stateFilePath, card.id, {
            ...prUpdate,
            status: 'waiting-input',
            error: 'Auto-merge failed: PR number was not returned by GitHub.',
          });
          console.log(`[kanban-orchestrator] Card #${card.id} auto-merge skipped: missing PR number`);
        } else if (yolo) {
          workspace.lastColumnMap.set(card.id, 'done');
          await updateCard(workspace.stateFilePath, card.id, { ...prUpdate, status: 'idle', column: 'done', completedAt: new Date().toISOString() });
          console.log(`[kanban-orchestrator] Card #${card.id} YOLO auto-completed: ${result.prUrl}`);
          await this.runDoneCleanup(workspace, card);
        } else {
          await updateCard(workspace.stateFilePath, card.id, { ...prUpdate, status: 'waiting-input' });
          console.log(`[kanban-orchestrator] Card #${card.id} PR created: ${result.prUrl}`);
        }
      } else {
        await updateCard(workspace.stateFilePath, card.id, {
          status: 'failed',
          error: result.error ?? 'Review failed',
          prUrl: undefined,
          prNumber: undefined,
          previewServerId: undefined,
          previewUrl: undefined,
          // Persist the review cache path even on failure so retry skips the subagent
          ...(result.reviewFilePath ? { reviewFilePath: result.reviewFilePath } : {}),
          reviewProgress: undefined,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Review failed for card #${card.id}:`, errMsg);
      await tracker.clear();
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        error: `Review failed: ${errMsg}`,
        prUrl: undefined,
        prNumber: undefined,
        previewServerId: undefined,
        previewUrl: undefined,
        reviewProgress: undefined,
      });
    } finally {
      this.reviewInProgress.delete(card.id);
    }
  }

  private async runDoneCleanup(workspace: WatchedWorkspaceEntry, card: Card): Promise<void> {
    const workspacePath = this.deps?.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) return;
    workspace.lastColumnMap.set(card.id, 'done');
    const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    if (!currentState) return;
    const freshCard = currentState.cards.find((c) => c.id === card.id) ?? card;

    if (freshCard.prNumber && freshCard.worktreePath) {
      const mergeError = await getPullRequestMergeError(freshCard.worktreePath, freshCard.prNumber);
      if (mergeError) {
        workspace.lastColumnMap.set(card.id, 'review');
        await updateCard(workspace.stateFilePath, card.id, { column: 'review', status: 'waiting-input', completedAt: undefined, error: mergeError });
        return;
      }
    }

    const previewCleanup = await cleanupCardReviewPreview(workspace.workspaceId, card.id);
    if (previewCleanup.reason) {
      console.log(`[kanban-orchestrator] Preview cleanup note for card #${card.id}: ${previewCleanup.reason}`);
    }

    await updateCard(workspace.stateFilePath, card.id, {
      status: 'idle',
      completedAt: new Date().toISOString(),
      error: undefined,
      previewServerId: undefined,
      previewUrl: undefined,
      reviewProgress: undefined,
      implementationProgress: undefined,
      planningProgress: undefined,
    });

    let freshState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    if (!freshState) return;

    await runWorkspaceMaintenance(
      workspace.workspaceId, workspace.stateFilePath, workspacePath, freshState, this.worktreeManager,
    );

    freshState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    if (!freshState) return;
    const allDone = freshState.cards.length > 0 && freshState.cards.every((c) => c.column === 'done');
    if (allDone) {
      console.log('[kanban-orchestrator] All cards done — merged worktrees cleaned and workspace base synced when safe');
    }
    const toStart = freshState.settings.yoloMode
      ? getAllReadyBacklogCards(freshState)
      : freshState.settings.autoAdvance
        ? getNewlyUnblockedCards(card.id, freshState)
        : [];

    for (const ready of toStart) {
      if (this.isCurrentlyProcessing(ready.id)) continue;
      console.log(`[kanban-orchestrator] Auto-starting card #${ready.id} "${ready.title}"`);
      await updateCard(workspace.stateFilePath, ready.id, { column: 'planning', status: 'agent-working' });
      workspace.lastColumnMap.set(ready.id, 'planning');
      await this.handleTransition(workspace, ready, 'planning');
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
