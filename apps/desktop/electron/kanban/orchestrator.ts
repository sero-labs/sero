/**
 * KanbanOrchestrator — state machine that reacts to card column transitions.
 *
 * Watches the kanban state file for column changes and triggers:
 * - Planning phase (backlog → planning): analyse codebase, generate subtasks
 * - Implementation phase (planning → in-progress): execute subtasks in worktree
 * - Review phase (in-progress → review): review diff, push, create PR
 *
 * Runs in the Electron main process, operates on the state file directly.
 */

import path from 'path';

import type { KanbanState, Card, Column } from './types';
import { WorktreeManager } from './worktree-manager';
import { PlanningProgressTracker } from './planning-progress';
import { ImplementationProgressTracker } from './implementation-progress';
import { ReviewProgressTracker } from './review-progress';
import { executeReview } from './review-executor';
import { executePlanning } from './planning-executor';
import { resolveExecutionWaves } from './wave-resolver';
import { executeWaves } from './subtask-executor';
import { appStateManager } from '../app-state';
import type { SubagentManager } from '../subagent/index';

// ── Helpers ──────────────────────────────────────────────────

const RETRYABLE_COLUMNS = new Set<Column>(['planning', 'in-progress', 'review']);

function isRetryableColumn(column: Column): boolean {
  return RETRYABLE_COLUMNS.has(column);
}

// ── Types ────────────────────────────────────────────────────

interface OrchestratorDeps {
  subagentManager: SubagentManager;
  getWorkspacePath: (workspaceId: string) => string | null;
  findWorkspaceByPath: (absPath: string) => { id: string; path: string } | null;
}

interface WatchedWorkspace {
  workspaceId: string;
  stateFilePath: string;
  lastColumnMap: Map<string, Column>;
}

// ── Orchestrator ─────────────────────────────────────────────

export class KanbanOrchestrator {
  private readonly worktreeManager = new WorktreeManager();
  private deps: OrchestratorDeps | null = null;
  private watched = new Map<string, WatchedWorkspace>();
  private planningInProgress = new Set<string>();
  private implementationInProgress = new Set<string>();
  private reviewInProgress = new Set<string>();

  setDeps(deps: OrchestratorDeps): void {
    this.deps = deps;
    console.log('[kanban-orchestrator] Dependencies injected');
  }

  // ── Startup Recovery ────────────────────────────────────

  /**
   * Scan all kanban state files for cards stuck in `agent-working` status
   * after an app restart. Re-triggers the appropriate phase for each.
   *
   * Must be called after setDeps() and after workspaces are loaded.
   */
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

      // Ensure workspace is watched before retrying
      if (!this.watched.has(ws.id)) {
        await this.watchWorkspace(ws.id, ws.path);
      }

      for (const card of stuckCards) {
        console.log(`[kanban-orchestrator] Recovery: card #${card.id} stuck in ${card.column} — retrying`);
        recovered++;
        await this.handleTransition(this.watched.get(ws.id)!, card, card.column, card.column);
      }
    }

    if (recovered > 0) {
      console.log(`[kanban-orchestrator] Recovery: retried ${recovered} stuck card(s)`);
    }
  }

  // ── Workspace Watching ──────────────────────────────────

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
  }

  unwatchWorkspace(workspaceId: string): void {
    const entry = this.watched.get(workspaceId);
    if (entry) {
      appStateManager.unwatch(entry.stateFilePath);
      this.watched.delete(workspaceId);
    }
  }

  // ── State Change Handler ────────────────────────────────

  async onStateChange(stateFilePath: string, newState: KanbanState): Promise<void> {
    if (!this.deps) return;

    let workspace = this.findWorkspace(stateFilePath);
    if (!workspace) workspace = this.autoWatch(stateFilePath);
    if (!workspace || !newState?.cards) return;

    for (const card of newState.cards) {
      const prevColumn = workspace.lastColumnMap.get(card.id);

      if (prevColumn && prevColumn !== card.column) {
        // Real column transition
        console.log(`[kanban-orchestrator] Transition: #${card.id} ${prevColumn} → ${card.column}`);
        await this.handleTransition(workspace, card, prevColumn, card.column);
      } else if (!prevColumn) {
        // New card that appeared already in an active column
        if (card.column === 'planning' && card.status === 'agent-working') {
          await this.handleTransition(workspace, card, 'backlog', 'planning');
        } else if (card.column === 'in-progress' && card.status === 'idle') {
          await this.handleTransition(workspace, card, 'planning', 'in-progress');
        }
      } else if (
        card.status === 'agent-working'
        && isRetryableColumn(card.column)
        && !this.isCurrentlyProcessing(card.id)
      ) {
        // Retry: card in active column needs processing (restart recovery or manual retry)
        console.log(`[kanban-orchestrator] Retry: #${card.id} in ${card.column}`);
        await this.handleTransition(workspace, card, card.column, card.column);
      }
    }

    workspace.lastColumnMap.clear();
    for (const card of newState.cards) {
      workspace.lastColumnMap.set(card.id, card.column);
    }
  }

  private findWorkspace(stateFilePath: string): WatchedWorkspace | null {
    for (const [, entry] of this.watched) {
      if (entry.stateFilePath === stateFilePath) return entry;
    }
    return null;
  }

  private autoWatch(stateFilePath: string): WatchedWorkspace | null {
    if (!this.deps) return null;
    const suffix = '/.sero/apps/kanban/state.json';
    const idx = stateFilePath.indexOf(suffix);
    if (idx === -1) return null;

    const workspacePath = stateFilePath.substring(0, idx);
    const ws = this.deps.findWorkspaceByPath(workspacePath);
    if (!ws) return null;

    console.log(`[kanban-orchestrator] Auto-watching workspace "${ws.id}"`);
    const emptyBaseline = new Map<string, Column>();
    this.watched.set(ws.id, { workspaceId: ws.id, stateFilePath, lastColumnMap: emptyBaseline });
    appStateManager.watch(stateFilePath);
    return this.watched.get(ws.id) ?? null;
  }

  // ── Transition Router ─────────────────────────────────

  private async handleTransition(
    workspace: WatchedWorkspace,
    card: Card,
    fromColumn: Column,
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
        await this.runReviewPhase(workspace, card);
        break;
      case 'done':
        await this.runDoneCleanup(workspace, card);
        break;
    }
  }

  // ── Planning Phase ────────────────────────────────────

  private async runPlanningPhase(workspace: WatchedWorkspace, card: Card): Promise<void> {
    if (!this.deps || this.planningInProgress.has(card.id)) return;
    this.planningInProgress.add(card.id);

    const workspacePath = this.deps.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) { this.planningInProgress.delete(card.id); return; }

    const tracker = new PlanningProgressTracker(
      workspace.stateFilePath, card.id,
      (fp, id, update) => this.updateCard(fp, id, update),
    );

    try {
      await this.updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

      const { worktreePath, branchName, greenfield } = await this.worktreeManager.create(
        workspacePath, card.id, card.title,
      );
      await this.updateCard(workspace.stateFilePath, card.id, { branch: branchName, worktreePath });

      const planResult = await this.runPlanningAgents(workspace, card, tracker, greenfield);

      await tracker.clear();
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'waiting-input',
        plan: planResult.plan,
        subtasks: planResult.subtasks,
        planningProgress: undefined,
      });
      console.log(`[kanban-orchestrator] Card #${card.id} planning complete — waiting for approval`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Planning failed for card #${card.id}:`, errMsg);
      await tracker.clear();
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'failed', error: `Planning failed: ${errMsg}`, planningProgress: undefined,
      });
    } finally {
      this.planningInProgress.delete(card.id);
    }
  }

  private async runPlanningAgents(
    workspace: WatchedWorkspace,
    card: Card,
    tracker: PlanningProgressTracker,
    greenfield = false,
  ): Promise<{ plan: string; subtasks: Card['subtasks'] }> {
    return executePlanning(
      { subagentManager: this.deps!.subagentManager, workspaceId: workspace.workspaceId },
      card,
      tracker,
      greenfield,
    );
  }

  // ── Implementation Phase ──────────────────────────────

  private async runImplementationPhase(workspace: WatchedWorkspace, card: Card): Promise<void> {
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
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'failed', error: 'No worktree path — was planning phase completed?',
      });
      this.implementationInProgress.delete(card.id);
      return;
    }

    const tracker = new ImplementationProgressTracker(
      workspace.stateFilePath, card.id,
      (fp, id, update) => this.updateCard(fp, id, update),
    );

    try {
      console.log(`[kanban-orchestrator] Starting implementation for card #${card.id}`);
      await this.updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

      // Reset all subtasks to pending
      const subtasks = freshCard.subtasks.map((s) => ({ ...s, status: 'pending' as const }));
      await this.updateCard(workspace.stateFilePath, card.id, { subtasks });

      const waves = resolveExecutionWaves(subtasks);
      console.log(`[kanban-orchestrator] Card #${card.id}: ${waves.length} waves, ${subtasks.length} subtasks`);

      await executeWaves(
        { subagentManager: this.deps.subagentManager, workspaceId: workspace.workspaceId },
        workspace.stateFilePath,
        freshCard,
        worktreePath,
        waves,
        tracker,
      );

      // All done — advance to review
      await tracker.clear();
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'idle',
        column: 'review',
        implementationProgress: undefined,
      });
      console.log(`[kanban-orchestrator] Card #${card.id} implementation complete → Review`);

      // Directly chain to review phase. The updateCard above writes via
      // appStateManager.write() which bypasses IPC, so onStateChange is
      // never called. We must trigger the next phase explicitly.
      const reviewCard = await this.readCard(workspace.stateFilePath, card.id);
      if (reviewCard) {
        workspace.lastColumnMap.set(card.id, 'review');
        await this.handleTransition(workspace, reviewCard, 'in-progress', 'review');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Implementation failed for card #${card.id}:`, errMsg);
      await tracker.clear();
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        error: `Implementation failed: ${errMsg}`,
        implementationProgress: undefined,
      });
    } finally {
      this.implementationInProgress.delete(card.id);
    }
  }

  // ── Review Phase ───────────────────────────────────────

  private async runReviewPhase(workspace: WatchedWorkspace, card: Card): Promise<void> {
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
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'failed', error: 'No worktree/branch — was implementation phase completed?',
      });
      this.reviewInProgress.delete(card.id);
      return;
    }

    const tracker = new ReviewProgressTracker(
      workspace.stateFilePath, card.id,
      (fp, id, update) => this.updateCard(fp, id, update),
    );

    try {
      console.log(`[kanban-orchestrator] Starting review for card #${card.id}`);
      await this.updateCard(workspace.stateFilePath, card.id, { status: 'agent-working' });

      const result = await executeReview(
        { subagentManager: this.deps.subagentManager, workspaceId: workspace.workspaceId },
        freshCard,
        worktreePath,
        branchName,
        tracker,
      );

      await tracker.clear();

      if (result.success) {
        await this.updateCard(workspace.stateFilePath, card.id, {
          status: 'waiting-input',
          prUrl: result.prUrl,
          prNumber: result.prNumber,
          reviewFilePath: result.reviewFilePath,
          reviewProgress: undefined,
        });
        console.log(`[kanban-orchestrator] Card #${card.id} PR created: ${result.prUrl}`);
      } else {
        await this.updateCard(workspace.stateFilePath, card.id, {
          status: 'failed',
          error: result.error ?? 'Review failed',
          // Persist the review cache path even on failure so retry skips the subagent
          ...(result.reviewFilePath ? { reviewFilePath: result.reviewFilePath } : {}),
          reviewProgress: undefined,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Review failed for card #${card.id}:`, errMsg);
      await tracker.clear();
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        error: `Review failed: ${errMsg}`,
        reviewProgress: undefined,
      });
    } finally {
      this.reviewInProgress.delete(card.id);
    }
  }

  // ── Done Cleanup ──────────────────────────────────────

  private async runDoneCleanup(workspace: WatchedWorkspace, card: Card): Promise<void> {
    const workspacePath = this.deps?.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) return;

    // Re-read card for latest worktree info
    const currentState = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    const freshCard = currentState?.cards.find((c) => c.id === card.id);
    if (!freshCard) return;

    try {
      // Remove worktree if it exists
      if (freshCard.worktreePath) {
        await this.worktreeManager.remove(workspacePath, card.id, { deleteBranch: false });
        console.log(`[kanban-orchestrator] Cleaned up worktree for card #${card.id}`);
      }

      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'idle',
        worktreePath: undefined,
        completedAt: new Date().toISOString(),
        reviewProgress: undefined,
        implementationProgress: undefined,
        planningProgress: undefined,
      });
    } catch (err) {
      console.warn(`[kanban-orchestrator] Worktree cleanup failed for card #${card.id}:`, err);
    }
  }

  // ── Retry Helpers ──────────────────────────────────────

  private isCurrentlyProcessing(cardId: string): boolean {
    return (
      this.planningInProgress.has(cardId)
      || this.implementationInProgress.has(cardId)
      || this.reviewInProgress.has(cardId)
    );
  }

  // ── State Helpers ─────────────────────────────────────

  private async updateCard(
    stateFilePath: string,
    cardId: string,
    update: Partial<Card>,
  ): Promise<void> {
    const raw = await appStateManager.read(stateFilePath) as KanbanState | null;
    if (!raw) return;
    const cards = raw.cards.map((c) =>
      c.id === cardId ? { ...c, ...update, updatedAt: new Date().toISOString() } : c,
    );
    await appStateManager.write(stateFilePath, { ...raw, cards });
  }

  private async readCard(stateFilePath: string, cardId: string): Promise<Card | null> {
    const raw = await appStateManager.read(stateFilePath) as KanbanState | null;
    return raw?.cards.find((c) => c.id === cardId) ?? null;
  }

  // ── Cleanup ───────────────────────────────────────────

  dispose(): void {
    for (const [workspaceId] of this.watched) {
      this.unwatchWorkspace(workspaceId);
    }
  }
}
