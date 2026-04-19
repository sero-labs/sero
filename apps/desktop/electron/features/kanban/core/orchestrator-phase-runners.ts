import path from 'path';
import type { Card, Column, KanbanState } from './types';
import type { OrchestratorDeps } from './orchestrator-types';
import type { WatchedWorkspaceEntry } from '../workspace/workspace-watch';
import { appStateManager } from '@electron/features/apps/state/manager';
import { WorktreeManager } from '@electron/features/vcs/worktree/manager';
import { PlanningProgressTracker } from '../planning/planning-progress';
import { ImplementationProgressTracker } from '../implementation/implementation-progress';
import { ReviewProgressTracker } from '../review/state';
import {
  executeReview,
  cleanupCardReviewPreview,
  completeReviewWithPr,
} from '../review/workflow';
import { getPullRequestMergeError } from '@electron/features/vcs/worktree/merge-status';
import { executePlanning } from '../planning/planning-executor';
import { executeImplementation } from '../implementation/implementation-executor';
import { updateCard, readCard } from './state-helpers';
import {
  isYoloModeEnabled,
  reconcilePersistedState,
  runWorkspaceMaintenance,
} from './orchestrator-helpers';
import {
  getAllReadyBacklogCards,
  getNewlyUnblockedCards,
  validateTransition,
} from './contracts';

export interface OrchestratorProcessingState {
  planningInProgress: Set<string>;
  implementationInProgress: Set<string>;
  reviewInProgress: Set<string>;
}

export interface OrchestratorPhaseContext {
  deps: OrchestratorDeps | null;
  worktreeManager: WorktreeManager;
  processing: OrchestratorProcessingState;
  handleTransition: (workspace: WatchedWorkspaceEntry, card: Card, toColumn: Column) => Promise<void>;
  isCurrentlyProcessing: (cardId: string) => boolean;
}

export async function recoverStuckCards(
  context: Pick<OrchestratorPhaseContext, 'deps' | 'handleTransition'>,
  watched: Map<string, WatchedWorkspaceEntry>,
  watchWorkspace: (workspaceId: string, workspacePath: string) => Promise<void>,
  workspaces: Array<{ id: string; path: string }>,
): Promise<void> {
  if (!context.deps) return;
  const kanbanSuffix = path.join('.sero', 'apps', 'kanban', 'state.json');
  let recovered = 0;

  for (const workspace of workspaces) {
    const stateFilePath = path.join(workspace.path, kanbanSuffix);
    let state: KanbanState | null;
    try {
      state = await appStateManager.read(stateFilePath) as KanbanState | null;
    } catch {
      continue;
    }
    if (!state?.cards) continue;

    const stuckCards = state.cards.filter(
      (card) => card.status === 'agent-working' && isRetryableColumn(card.column),
    );
    if (stuckCards.length === 0) continue;
    if (!watched.has(workspace.id)) {
      await watchWorkspace(workspace.id, workspace.path);
    }

    for (const card of stuckCards) {
      console.log(`[kanban-orchestrator] Recovery: card #${card.id} stuck in ${card.column} — retrying`);
      recovered++;
      await context.handleTransition(watched.get(workspace.id)!, card, card.column);
    }
  }

  if (recovered > 0) {
    console.log(`[kanban-orchestrator] Recovery: retried ${recovered} stuck card(s)`);
  }
}

export async function runPlanningPhase(
  context: OrchestratorPhaseContext,
  workspace: WatchedWorkspaceEntry,
  card: Card,
): Promise<void> {
  if (!context.deps || context.processing.planningInProgress.has(card.id)) return;
  context.processing.planningInProgress.add(card.id);

  const workspacePath = context.deps.getWorkspacePath(workspace.workspaceId);
  if (!workspacePath) {
    context.processing.planningInProgress.delete(card.id);
    return;
  }

  const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
  if (currentState) {
    const validation = validateTransition(card, 'planning', currentState);
    if (!validation.valid) {
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        column: 'backlog',
        error: `Cannot start planning: ${validation.errors.join('; ')}`,
      });
      context.processing.planningInProgress.delete(card.id);
      return;
    }
  }

  await runWorkspaceMaintenance(
    workspace.workspaceId,
    workspace.stateFilePath,
    workspacePath,
    currentState,
    context.worktreeManager,
  );

  const tracker = new PlanningProgressTracker(workspace.stateFilePath, card.id, updateCard);

  try {
    await updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

    const { worktreePath, branchName, greenfield } = await context.worktreeManager.create(
      workspacePath,
      card.id,
      card.title,
    );
    await updateCard(workspace.stateFilePath, card.id, { branch: branchName, worktreePath });

    const settingsState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    const planResult = await executePlanning({
      subagentManager: context.deps.subagentManager,
      workspaceId: workspace.workspaceId,
      planOptions: { testingEnabled: settingsState?.settings?.testingEnabled },
    }, card, tracker, greenfield);

    await tracker.clear();

    const yolo = await isYoloModeEnabled(workspace.stateFilePath);
    const planUpdate = {
      plan: planResult.plan,
      subtasks: planResult.subtasks,
      planningProgress: undefined,
    };

    if (yolo) {
      workspace.lastColumnMap.set(card.id, 'in-progress');
      await updateCard(workspace.stateFilePath, card.id, {
        ...planUpdate,
        status: 'idle',
        column: 'in-progress',
      });
      console.log(`[kanban-orchestrator] Card #${card.id} planning complete — YOLO auto-approved`);
      const approved = await readCard(workspace.stateFilePath, card.id);
      if (approved) {
        await context.handleTransition(workspace, approved, 'in-progress');
      }
      return;
    }

    await updateCard(workspace.stateFilePath, card.id, {
      ...planUpdate,
      status: 'waiting-input',
    });
    console.log(`[kanban-orchestrator] Card #${card.id} planning complete — waiting for approval`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[kanban-orchestrator] Planning failed for card #${card.id}:`, errMsg);
    await tracker.clear();
    await updateCard(workspace.stateFilePath, card.id, {
      status: 'failed',
      error: `Planning failed: ${errMsg}`,
      planningProgress: undefined,
    });
  } finally {
    context.processing.planningInProgress.delete(card.id);
  }
}

export async function runImplementationPhase(
  context: OrchestratorPhaseContext,
  workspace: WatchedWorkspaceEntry,
  card: Card,
): Promise<void> {
  if (!context.deps || context.processing.implementationInProgress.has(card.id)) return;
  context.processing.implementationInProgress.add(card.id);

  const workspacePath = context.deps.getWorkspacePath(workspace.workspaceId);
  if (!workspacePath) {
    context.processing.implementationInProgress.delete(card.id);
    return;
  }

  const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
  const freshCard = currentState?.cards.find((entry) => entry.id === card.id);
  if (!freshCard) {
    context.processing.implementationInProgress.delete(card.id);
    return;
  }

  const worktreePath = freshCard.worktreePath;
  if (!worktreePath) {
    await updateCard(workspace.stateFilePath, card.id, {
      status: 'failed',
      error: 'No worktree path — was planning phase completed?',
    });
    context.processing.implementationInProgress.delete(card.id);
    return;
  }

  const tracker = new ImplementationProgressTracker(workspace.stateFilePath, card.id, updateCard);

  try {
    console.log(`[kanban-orchestrator] Starting implementation for card #${card.id}`);
    await updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

    const subtasks = freshCard.subtasks.map((subtask) => ({
      ...subtask,
      status: 'pending' as const,
    }));
    await updateCard(workspace.stateFilePath, card.id, { subtasks });

    console.log(
      `[kanban-orchestrator] Card #${card.id}: single implementer executing ${subtasks.length} planned subtask(s)`,
    );

    const stateForSettings = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    const settings = stateForSettings?.settings;

    await executeImplementation(
      {
        subagentManager: context.deps.subagentManager,
        workspaceId: workspace.workspaceId,
        settings,
      },
      workspace.stateFilePath,
      freshCard,
      worktreePath,
      tracker,
    );

    await tracker.clear();
    workspace.lastColumnMap.set(card.id, 'review');
    await updateCard(workspace.stateFilePath, card.id, {
      status: 'idle',
      column: 'review',
      implementationProgress: undefined,
    });
    console.log(`[kanban-orchestrator] Card #${card.id} impl complete → Review`);

    const reviewCard = await readCard(workspace.stateFilePath, card.id);
    if (reviewCard) {
      await context.handleTransition(workspace, reviewCard, 'review');
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[kanban-orchestrator] Implementation failed for card #${card.id}:`, errMsg);
    await tracker.clear();
    await updateCard(workspace.stateFilePath, card.id, {
      status: 'failed',
      error: `Implementation failed: ${errMsg}`,
      implementationProgress: undefined,
    });
  } finally {
    context.processing.implementationInProgress.delete(card.id);
  }
}

export async function runReviewPhase(
  context: OrchestratorPhaseContext,
  workspace: WatchedWorkspaceEntry,
  card: Card,
): Promise<void> {
  if (!context.deps || context.processing.reviewInProgress.has(card.id)) return;
  context.processing.reviewInProgress.add(card.id);

  const workspacePath = context.deps.getWorkspacePath(workspace.workspaceId);
  if (!workspacePath) {
    context.processing.reviewInProgress.delete(card.id);
    return;
  }

  const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
  const freshCard = currentState?.cards.find((entry) => entry.id === card.id);
  if (!freshCard) {
    context.processing.reviewInProgress.delete(card.id);
    return;
  }

  const worktreePath = freshCard.worktreePath;
  const branchName = freshCard.branch;
  if (!worktreePath || !branchName) {
    await updateCard(workspace.stateFilePath, card.id, {
      status: 'failed',
      error: 'No worktree/branch — was implementation phase completed?',
    });
    context.processing.reviewInProgress.delete(card.id);
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
      subagentManager: context.deps.subagentManager,
      workspaceId: workspace.workspaceId,
      settings: reviewState?.settings,
    }, freshCard, worktreePath, branchName, tracker);

    await tracker.clear();

    if (!result.success) {
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        error: result.error ?? 'Review failed',
        prUrl: undefined,
        prNumber: undefined,
        previewServerId: undefined,
        previewUrl: undefined,
        ...(result.reviewFilePath ? { reviewFilePath: result.reviewFilePath } : {}),
        reviewProgress: undefined,
      });
      return;
    }

    const yolo = await isYoloModeEnabled(workspace.stateFilePath);
    const outcome = await completeReviewWithPr({
      stateFilePath: workspace.stateFilePath,
      cardId: card.id,
      worktreePath,
      yolo,
      settings: reviewState?.settings,
    }, result);

    if (outcome.movedToDone) {
      workspace.lastColumnMap.set(card.id, 'done');
      await runDoneCleanup(context, workspace, card);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
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
    context.processing.reviewInProgress.delete(card.id);
  }
}

export async function runDoneCleanup(
  context: OrchestratorPhaseContext,
  workspace: WatchedWorkspaceEntry,
  card: Card,
): Promise<void> {
  const workspacePath = context.deps?.getWorkspacePath(workspace.workspaceId);
  if (!workspacePath) return;

  workspace.lastColumnMap.set(card.id, 'done');
  const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
  if (!currentState) return;
  const freshCard = currentState.cards.find((entry) => entry.id === card.id) ?? card;

  if (freshCard.prNumber && freshCard.worktreePath) {
    const mergeError = await getPullRequestMergeError(freshCard.worktreePath, freshCard.prNumber);
    if (mergeError) {
      workspace.lastColumnMap.set(card.id, 'review');
      await updateCard(workspace.stateFilePath, card.id, {
        column: 'review',
        status: 'waiting-input',
        completedAt: undefined,
        error: mergeError,
      });
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
    workspace.workspaceId,
    workspace.stateFilePath,
    workspacePath,
    freshState,
    context.worktreeManager,
  );

  freshState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
  if (!freshState) return;

  const allDone = freshState.cards.length > 0 && freshState.cards.every((entry) => entry.column === 'done');
  if (allDone) {
    console.log('[kanban-orchestrator] All cards done — merged worktrees cleaned and workspace base synced when safe');
  }

  const toStart = freshState.settings.yoloMode
    ? getAllReadyBacklogCards(freshState)
    : freshState.settings.autoAdvance
      ? getNewlyUnblockedCards(card.id, freshState)
      : [];

  for (const ready of toStart) {
    if (context.isCurrentlyProcessing(ready.id)) continue;
    console.log(`[kanban-orchestrator] Auto-starting card #${ready.id} "${ready.title}"`);
    await updateCard(workspace.stateFilePath, ready.id, {
      column: 'planning',
      status: 'agent-working',
    });
    workspace.lastColumnMap.set(ready.id, 'planning');
    await context.handleTransition(workspace, ready, 'planning');
  }
}

export async function reconcileWatchedWorkspace(
  stateFilePath: string,
  lastColumnMap: Map<string, Column>,
  state: KanbanState | null,
): Promise<void> {
  await reconcilePersistedState(stateFilePath, lastColumnMap, state);
}

const RETRYABLE_COLUMNS = new Set<Column>(['planning', 'in-progress', 'review']);

function isRetryableColumn(column: Column): boolean {
  return RETRYABLE_COLUMNS.has(column);
}
