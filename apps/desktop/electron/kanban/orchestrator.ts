/**
 * KanbanOrchestrator — state machine that reacts to card column transitions.
 *
 * Watches the kanban state file for column changes and triggers:
 * - Planning phase (backlog → planning): analyse codebase, generate subtasks
 * - Implementation phase (planning → in-progress): execute subtasks in worktree
 *
 * Runs in the Electron main process, operates on the state file directly.
 */

import path from 'path';

import type { KanbanState, Card, Column } from './types';
import { WorktreeManager } from './worktree-manager';
import { PlanningProgressTracker } from './planning-progress';
import { ImplementationProgressTracker } from './implementation-progress';
import {
  buildPlanningPrompt,
  buildSubtaskGenerationPrompt,
  PLANNER_SYSTEM_PROMPT,
  parsePlanResult,
} from './prompts';
import { resolveExecutionWaves } from './wave-resolver';
import { executeWaves } from './subtask-executor';
import { appStateManager } from '../app-state';
import type { SubagentManager } from '../subagent/index';

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

  setDeps(deps: OrchestratorDeps): void {
    this.deps = deps;
    console.log('[kanban-orchestrator] Dependencies injected');
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
        console.log(`[kanban-orchestrator] Transition: #${card.id} ${prevColumn} → ${card.column}`);
        await this.handleTransition(workspace, card, prevColumn, card.column);
      } else if (!prevColumn) {
        if (card.column === 'planning' && card.status === 'agent-working') {
          await this.handleTransition(workspace, card, 'backlog', 'planning');
        } else if (card.column === 'in-progress' && card.status === 'idle') {
          await this.handleTransition(workspace, card, 'planning', 'in-progress');
        }
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
    _fromColumn: Column,
    toColumn: Column,
  ): Promise<void> {
    switch (toColumn) {
      case 'planning':
        await this.runPlanningPhase(workspace, card);
        break;
      case 'in-progress':
        await this.runImplementationPhase(workspace, card);
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

      const { worktreePath, branchName } = await this.worktreeManager.create(
        workspacePath, card.id, card.title,
      );
      await this.updateCard(workspace.stateFilePath, card.id, { branch: branchName, worktreePath });

      const planResult = await this.runPlanningAgents(workspace, card, tracker);

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
  ): Promise<{ plan: string; subtasks: Card['subtasks'] }> {
    const { subagentManager } = this.deps!;
    const parentSessionId = `kanban-card-${card.id}`;
    const taskDescription = buildPlanningPrompt(card);

    tracker.setPhase('Analysing codebase');
    tracker.addAgent('analyst');
    tracker.addAgent('scout');
    await tracker.flush();

    const reconResult = await subagentManager.runParallel({
      tasks: [
        { agent: 'analyst', task: `Analyse the codebase for this development task:\n\n${taskDescription}\n\nFocus on:\n1. Relevant files and modules\n2. Existing patterns and conventions\n3. Dependencies and integration points\n4. Potential challenges` },
        { agent: 'scout', task: `Quick reconnaissance for this task:\n\n${taskDescription}\n\nFind:\n- Related files and test files\n- Similar patterns already implemented\n- Config files that may need changes` },
      ],
      parentSessionId,
      workspaceId: workspace.workspaceId,
      onUpdate: (text) => tracker.addLogLine(text),
    });

    tracker.completeAgent('analyst');
    tracker.completeAgent('scout');
    tracker.setPhase('Generating plan');
    tracker.addAgent('planner');
    await tracker.flush();

    const planResult = await subagentManager.runSingle({
      task: buildSubtaskGenerationPrompt(card, reconResult),
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      parentSessionId,
      workspaceId: workspace.workspaceId,
      onUpdate: (text) => tracker.addLogLine(text),
    });

    tracker.completeAgent('planner');
    await tracker.flush();

    return parsePlanResult(planResult);
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

  // ── Cleanup ───────────────────────────────────────────

  dispose(): void {
    for (const [workspaceId] of this.watched) {
      this.unwatchWorkspace(workspaceId);
    }
  }
}
