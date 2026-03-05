/**
 * KanbanOrchestrator — state machine that reacts to card column transitions.
 *
 * Phase 2 scope: handles `backlog → planning` transitions.
 *
 * Watches the kanban state file for column changes. When a card moves
 * to "planning", it spawns analyst + scout subagents to explore the
 * codebase, then generates a subtask breakdown and plan. The card is
 * set to "waiting-input" status for user approval before advancing.
 *
 * The orchestrator runs in the Electron main process and operates on
 * the state file directly (same file the UI and Pi extension read/write).
 */

import path from 'path';

import type { KanbanState, Card, Column } from './types';
import { WorktreeManager } from './worktree-manager';
import { appStateManager } from '../app-state';
import type { SubagentManager } from '../subagent/index';

// ── Types ────────────────────────────────────────────────────

interface OrchestratorDeps {
  subagentManager: SubagentManager;
  getWorkspacePath: (workspaceId: string) => string | null;
  /** Reverse lookup: given an absolute path, find the workspace that contains it. */
  findWorkspaceByPath: (absPath: string) => { id: string; path: string } | null;
}

interface WatchedWorkspace {
  workspaceId: string;
  stateFilePath: string;
  /** Snapshot of card columns from the last state read. */
  lastColumnMap: Map<string, Column>;
}

// ── Orchestrator ─────────────────────────────────────────────

export class KanbanOrchestrator {
  private readonly worktreeManager = new WorktreeManager();
  private deps: OrchestratorDeps | null = null;
  private watched = new Map<string, WatchedWorkspace>();
  private planningInProgress = new Set<string>(); // card IDs currently being planned

  /**
   * Inject dependencies lazily (called after shared-infra is initialised).
   */
  setDeps(deps: OrchestratorDeps): void {
    this.deps = deps;
    console.log('[kanban-orchestrator] Dependencies injected');
  }

  /**
   * Start watching a workspace's kanban state file for transitions.
   *
   * Called when a workspace is opened/activated. The orchestrator reads
   * the current state as a baseline, then watches for changes.
   */
  async watchWorkspace(workspaceId: string, workspacePath: string): Promise<void> {
    const stateFilePath = path.join(workspacePath, '.sero', 'apps', 'kanban', 'state.json');

    // Read initial state
    const initial = await appStateManager.read(stateFilePath) as KanbanState | null;
    const lastColumnMap = new Map<string, Column>();
    if (initial?.cards) {
      for (const card of initial.cards) {
        lastColumnMap.set(card.id, card.column);
      }
    }

    this.watched.set(workspaceId, { workspaceId, stateFilePath, lastColumnMap });

    // Start watching — the AppStateManager pushes change events via IPC.
    // We also need to watch at the main-process level.
    appStateManager.watch(stateFilePath);

    console.log(`[kanban-orchestrator] Watching workspace ${workspaceId} at ${stateFilePath}`);
  }

  /**
   * Stop watching a workspace.
   */
  unwatchWorkspace(workspaceId: string): void {
    const entry = this.watched.get(workspaceId);
    if (entry) {
      appStateManager.unwatch(entry.stateFilePath);
      this.watched.delete(workspaceId);
    }
  }

  /**
   * Handle a state file change. Called from the IPC layer when the
   * kanban state file is modified (by the UI, Pi extension, or this
   * orchestrator itself).
   *
   * Detects column transitions and triggers appropriate phase handlers.
   */
  async onStateChange(stateFilePath: string, newState: KanbanState): Promise<void> {
    console.log(`[kanban-orchestrator] onStateChange called for ${stateFilePath}`);

    if (!this.deps) {
      console.warn('[kanban-orchestrator] onStateChange called before setDeps() — ignoring');
      return;
    }

    // Find which workspace this belongs to
    let workspace: WatchedWorkspace | null = null;
    for (const [, entry] of this.watched) {
      if (entry.stateFilePath === stateFilePath) {
        workspace = entry;
        break;
      }
    }

    // Auto-watch: if we haven't seen this workspace yet, register it now.
    // The state file path pattern is {workspacePath}/.sero/apps/kanban/state.json
    //
    // Important: when auto-watching we deliberately seed the baseline with an
    // EMPTY column map so the incoming state is treated as "all new cards".
    // This ensures that cards already in the 'planning' column with
    // 'agent-working' status will be detected as transitions and trigger the
    // planning phase (since prevColumn will be undefined → handled below).
    if (!workspace) {
      console.log('[kanban-orchestrator] Workspace not yet watched — attempting auto-registration');
      const suffix = '/.sero/apps/kanban/state.json';
      const idx = stateFilePath.indexOf(suffix);
      if (idx !== -1) {
        const workspacePath = stateFilePath.substring(0, idx);
        const ws = this.deps.findWorkspaceByPath(workspacePath);
        if (ws) {
          console.log(`[kanban-orchestrator] Auto-watching workspace "${ws.id}" at ${ws.path}`);
          // Register with empty baseline so all cards look "new"
          const emptyBaseline = new Map<string, Column>();
          this.watched.set(ws.id, {
            workspaceId: ws.id,
            stateFilePath,
            lastColumnMap: emptyBaseline,
          });
          appStateManager.watch(stateFilePath);
          workspace = this.watched.get(ws.id) ?? null;
        } else {
          console.warn(`[kanban-orchestrator] Could not find workspace for path: ${workspacePath}`);
        }
      } else {
        console.warn(`[kanban-orchestrator] State file path does not match expected pattern: ${stateFilePath}`);
      }
    }

    if (!workspace || !newState?.cards) {
      console.warn('[kanban-orchestrator] No workspace or no cards — skipping', {
        hasWorkspace: !!workspace,
        hasCards: !!newState?.cards,
        cardCount: newState?.cards?.length,
      });
      return;
    }

    console.log(`[kanban-orchestrator] Processing ${newState.cards.length} cards for workspace "${workspace.workspaceId}"`);


    // Detect transitions
    for (const card of newState.cards) {
      const prevColumn = workspace.lastColumnMap.get(card.id);

      if (prevColumn && prevColumn !== card.column) {
        console.log(`[kanban-orchestrator] Transition detected: card #${card.id} "${card.title}" ${prevColumn} → ${card.column}`);
        await this.handleTransition(workspace, card, prevColumn, card.column);
      } else if (!prevColumn) {
        // First time seeing this card. If it's already in 'planning' with
        // 'agent-working' status, that means planning was requested but the
        // orchestrator wasn't watching yet. Trigger the planning phase now.
        if (card.column === 'planning' && card.status === 'agent-working') {
          console.log(`[kanban-orchestrator] Card #${card.id} "${card.title}" already in planning/agent-working — triggering planning phase`);
          await this.handleTransition(workspace, card, 'backlog', 'planning');
        } else {
          console.log(`[kanban-orchestrator] New card #${card.id} "${card.title}" in column "${card.column}" — seeding baseline`);
        }
      }
    }

    // Update baseline
    workspace.lastColumnMap.clear();
    for (const card of newState.cards) {
      workspace.lastColumnMap.set(card.id, card.column);
    }
  }

  // ── Transition Handler ────────────────────────────────────

  private async handleTransition(
    workspace: WatchedWorkspace,
    card: Card,
    fromColumn: Column,
    toColumn: Column,
  ): Promise<void> {
    console.log(
      `[kanban-orchestrator] Card #${card.id} "${card.title}": ${fromColumn} → ${toColumn}`,
    );

    switch (toColumn) {
      case 'planning':
        await this.runPlanningPhase(workspace, card);
        break;
      // Phase 3+: handle 'in-progress', 'review', etc.
    }
  }

  // ── Planning Phase ────────────────────────────────────────

  private async runPlanningPhase(
    workspace: WatchedWorkspace,
    card: Card,
  ): Promise<void> {
    if (!this.deps) {
      console.error('[kanban-orchestrator] Not initialised — call setDeps()');
      return;
    }

    // Prevent duplicate planning runs
    if (this.planningInProgress.has(card.id)) {
      console.log(`[kanban-orchestrator] Card #${card.id} already being planned, skipping`);
      return;
    }
    this.planningInProgress.add(card.id);

    const workspacePath = this.deps.getWorkspacePath(workspace.workspaceId);
    if (!workspacePath) {
      console.error(`[kanban-orchestrator] Workspace ${workspace.workspaceId} not found`);
      this.planningInProgress.delete(card.id);
      return;
    }

    try {
      console.log(`[kanban-orchestrator] Starting planning phase for card #${card.id} "${card.title}"`);

      // 1. Update card status to agent-working
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'agent-working',
      });
      console.log(`[kanban-orchestrator] Card #${card.id} status set to agent-working`);

      // 2. Create worktree for isolation
      console.log(`[kanban-orchestrator] Creating worktree for card #${card.id} at workspace ${workspacePath}`);
      const { worktreePath, branchName } = await this.worktreeManager.create(
        workspacePath,
        card.id,
        card.title,
      );

      console.log(`[kanban-orchestrator] Worktree created: branch=${branchName}, path=${worktreePath}`);

      // Update card with branch/worktree info
      await this.updateCard(workspace.stateFilePath, card.id, {
        branch: branchName,
        worktreePath,
      });

      // 3. Run planning agents (analyst + scout in parallel, then synthesise)
      console.log(`[kanban-orchestrator] Running planning agents for card #${card.id}`);
      const planResult = await this.runPlanningAgents(
        workspace,
        card,
        workspacePath,
      );

      // 4. Update card with plan and subtasks, set waiting-input for approval
      console.log(`[kanban-orchestrator] Planning agents finished for card #${card.id} — ${planResult.subtasks.length} subtasks generated`);
      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'waiting-input',
        plan: planResult.plan,
        subtasks: planResult.subtasks,
      });

      console.log(`[kanban-orchestrator] Card #${card.id} planning complete — waiting for approval`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kanban-orchestrator] Planning failed for card #${card.id}:`, errMsg);

      await this.updateCard(workspace.stateFilePath, card.id, {
        status: 'failed',
        error: `Planning failed: ${errMsg}`,
      });
    } finally {
      this.planningInProgress.delete(card.id);
    }
  }

  private async runPlanningAgents(
    workspace: WatchedWorkspace,
    card: Card,
    workspacePath: string,
  ): Promise<{
    plan: string;
    subtasks: Card['subtasks'];
  }> {
    if (!this.deps) throw new Error('Not initialised');

    const { subagentManager } = this.deps;
    const parentSessionId = `kanban-card-${card.id}`;

    // Build the task prompt for the planning chain
    const taskDescription = buildPlanningPrompt(card);

    // Run analyst + scout in parallel to gather codebase context
    console.log(`[kanban-orchestrator] Dispatching analyst + scout agents in parallel for card #${card.id}`);
    const reconResult = await subagentManager.runParallel({
      tasks: [
        {
          agent: 'analyst',
          task: `Analyse the codebase for this development task:\n\n${taskDescription}\n\nFocus on:\n1. Relevant files and modules\n2. Existing patterns and conventions\n3. Dependencies and integration points\n4. Potential challenges`,
        },
        {
          agent: 'scout',
          task: `Quick reconnaissance for this task:\n\n${taskDescription}\n\nFind:\n- Related files and test files\n- Similar patterns already implemented\n- Config files that may need changes`,
        },
      ],
      parentSessionId,
      workspaceId: workspace.workspaceId,
      onUpdate: (text) => {
        console.log(`[kanban-orchestrator] [card-${card.id}] ${text}`);
      },
    });

    console.log(`[kanban-orchestrator] Recon complete for card #${card.id} (${reconResult.length} chars). Running planner agent…`);

    // Chain: use analysis results to generate a concrete plan with subtasks
    const planResult = await subagentManager.runSingle({
      task: buildSubtaskGenerationPrompt(card, reconResult),
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      parentSessionId,
      workspaceId: workspace.workspaceId,
      onUpdate: (text) => {
        console.log(`[kanban-orchestrator] [card-${card.id}] ${text}`);
      },
    });

    console.log(`[kanban-orchestrator] Planner agent complete for card #${card.id} (${planResult.length} chars). Parsing…`);

    // Parse the plan result into structured subtasks
    const parsed = parsePlanResult(planResult);
    console.log(`[kanban-orchestrator] Parsed plan for card #${card.id}: ${parsed.subtasks.length} subtasks, plan length ${parsed.plan.length}`);
    return parsed;
  }

  // ── State Helpers ─────────────────────────────────────────

  /**
   * Update a single card's fields in the state file.
   *
   * Reads current state, applies partial update to the matching card,
   * writes atomically. Thread-safe via AppStateManager's write queue.
   */
  private async updateCard(
    stateFilePath: string,
    cardId: string,
    update: Partial<Card>,
  ): Promise<void> {
    const raw = await appStateManager.read(stateFilePath) as KanbanState | null;
    if (!raw) return;

    const cards = raw.cards.map((c) =>
      c.id === cardId
        ? { ...c, ...update, updatedAt: new Date().toISOString() }
        : c,
    );

    await appStateManager.write(stateFilePath, { ...raw, cards });
  }

  // ── Cleanup ───────────────────────────────────────────────

  dispose(): void {
    for (const [workspaceId] of this.watched) {
      this.unwatchWorkspace(workspaceId);
    }
  }
}

// ── Prompt Builders ──────────────────────────────────────────

function buildPlanningPrompt(card: Card): string {
  let prompt = `# Task: ${card.title}\n\n`;

  if (card.description) {
    prompt += `## Description\n${card.description}\n\n`;
  }

  if (card.acceptance.length > 0) {
    prompt += `## Acceptance Criteria\n`;
    for (const ac of card.acceptance) {
      prompt += `- ${ac}\n`;
    }
    prompt += '\n';
  }

  prompt += `Priority: ${card.priority}\n`;
  return prompt;
}

function buildSubtaskGenerationPrompt(card: Card, analysisResults: string): string {
  return `Based on the following codebase analysis, create a detailed implementation plan with subtasks for this card:

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((a) => `- ${a}`).join('\n')}` : ''}

# Codebase Analysis
${analysisResults}

# Instructions
Generate a structured implementation plan. Output ONLY a JSON object with this exact shape:

\`\`\`json
{
  "plan": "A 2-4 paragraph description of the implementation approach",
  "subtasks": [
    {
      "id": "1",
      "title": "Short title for this subtask",
      "description": "What this subtask involves",
      "dependsOn": []
    }
  ]
}
\`\`\`

Rules for subtasks:
- 2-8 subtasks is ideal
- Each subtask should be independently implementable where possible
- Use dependsOn to specify ordering constraints (array of subtask IDs)
- Parallelisable subtasks should have empty dependsOn arrays
- Include a final "write tests" subtask if applicable
- Keep descriptions concise but specific`;
}

const PLANNER_SYSTEM_PROMPT = `You are a senior software architect specialising in breaking down development tasks into implementable subtasks.

You analyse codebase context and produce structured implementation plans with:
- Clear subtask breakdown with dependencies
- Non-overlapping file scopes per subtask (for parallel execution)
- Realistic scope estimates

Always output valid JSON matching the requested schema. No markdown outside the JSON block.`;

// ── Plan Parser ──────────────────────────────────────────────

function parsePlanResult(raw: string): {
  plan: string;
  subtasks: Card['subtasks'];
} {
  // Extract JSON from the response (may be wrapped in markdown fences)
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*"plan"[\s\S]*"subtasks"[\s\S]*\}/);

  if (!jsonMatch) {
    // Fallback: use the raw text as the plan with no subtasks
    return {
      plan: raw.slice(0, 2000),
      subtasks: [],
    };
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const plan = typeof parsed.plan === 'string' ? parsed.plan : raw.slice(0, 2000);
    const subtasks: Card['subtasks'] = [];

    if (Array.isArray(parsed.subtasks)) {
      for (const st of parsed.subtasks) {
        subtasks.push({
          id: String(st.id || subtasks.length + 1),
          title: String(st.title || 'Untitled subtask'),
          description: String(st.description || ''),
          status: 'pending',
          dependsOn: Array.isArray(st.dependsOn) ? st.dependsOn.map(String) : [],
        });
      }
    }

    return { plan, subtasks };
  } catch {
    return {
      plan: raw.slice(0, 2000),
      subtasks: [],
    };
  }
}
