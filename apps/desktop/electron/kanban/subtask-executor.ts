/**
 * SubtaskExecutor — runs implementation subtasks in dependency waves.
 *
 * Handles single and parallel subtask execution, VCS checkpoints,
 * and state updates. Used by the KanbanOrchestrator during the
 * implementation phase.
 */

import type { Card, KanbanState, Subtask } from './types';
import type { ImplementationProgressTracker } from './implementation-progress';
import { buildSubtaskPrompt, IMPLEMENTER_SYSTEM_PROMPT } from './prompts';
import { createCheckpointInWorktree } from './worktree-git';
import { appStateManager } from '../app-state';
import type { SubagentManager } from '../subagent/index';

export interface SubtaskExecutorDeps {
  subagentManager: SubagentManager;
  workspaceId: string;
}

/**
 * Execute all subtask waves sequentially, running subtasks within
 * each wave in parallel.
 */
export async function executeWaves(
  deps: SubtaskExecutorDeps,
  stateFilePath: string,
  card: Card,
  worktreePath: string,
  waves: string[][],
  tracker: ImplementationProgressTracker,
): Promise<void> {
  const parentSessionId = `kanban-impl-${card.id}`;
  let liveCard = card;

  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave = waves[waveIdx];
    const waveLabel = `Wave ${waveIdx + 1}/${waves.length}`;
    tracker.setPhase(waveLabel);
    console.log(`[kanban-executor] Card #${card.id} ${waveLabel}: subtasks [${wave.join(', ')}]`);

    // Mark wave subtasks as in-progress
    await updateSubtaskStatuses(stateFilePath, card.id, wave, 'in-progress');
    for (const stId of wave) {
      const st = liveCard.subtasks.find((s) => s.id === stId);
      tracker.addAgent(st?.title ?? stId);
    }
    await tracker.flush();

    if (wave.length === 1) {
      await executeSingleSubtask(
        deps, stateFilePath, card, wave[0], worktreePath, parentSessionId, tracker,
      );
    } else {
      await executeParallelSubtasks(
        deps, stateFilePath, card, wave, worktreePath, parentSessionId, tracker,
      );
    }

    // Re-read card to get updated subtask statuses
    const fresh = await appStateManager.read(stateFilePath) as KanbanState | null;
    liveCard = fresh?.cards.find((c) => c.id === card.id) ?? card;

    // Check for failures in this wave
    const failedInWave = liveCard.subtasks
      .filter((s) => wave.includes(s.id) && s.status === 'failed');

    if (failedInWave.length > 0) {
      throw new Error(
        `Subtask(s) failed: ${failedInWave.map((s) => `"${s.title}"`).join(', ')}`,
      );
    }
  }
}

// ── Single Subtask ──────────────────────────────────────────

async function executeSingleSubtask(
  deps: SubtaskExecutorDeps,
  stateFilePath: string,
  card: Card,
  subtaskId: string,
  worktreePath: string,
  parentSessionId: string,
  tracker: ImplementationProgressTracker,
): Promise<void> {
  const subtask = card.subtasks.find((s) => s.id === subtaskId);
  const taskPrompt = buildSubtaskPrompt(card, subtaskId);

  try {
    const result = await deps.subagentManager.runSingle({
      task: taskPrompt,
      systemPrompt: IMPLEMENTER_SYSTEM_PROMPT,
      parentSessionId,
      workspaceId: deps.workspaceId,
      cwd: worktreePath,
      isolated: true,
      onUpdate: (text) => tracker.addLogLine(text),
    });

    if (result.startsWith('Error:')) {
      await updateSubtaskStatuses(stateFilePath, card.id, [subtaskId], 'failed');
      tracker.completeAgent(subtask?.title ?? subtaskId, 'failed');
      return;
    }

    const checkpointId = await createCheckpointInWorktree(
      worktreePath, `subtask: ${subtask?.title ?? subtaskId}`,
    );
    await markSubtaskCompleted(stateFilePath, card.id, subtaskId, checkpointId);
    tracker.completeAgent(subtask?.title ?? subtaskId, 'completed');
  } catch (err) {
    await updateSubtaskStatuses(stateFilePath, card.id, [subtaskId], 'failed');
    tracker.completeAgent(subtask?.title ?? subtaskId, 'failed');
    throw err;
  }
}

// ── Parallel Subtasks ───────────────────────────────────────

async function executeParallelSubtasks(
  deps: SubtaskExecutorDeps,
  stateFilePath: string,
  card: Card,
  subtaskIds: string[],
  worktreePath: string,
  parentSessionId: string,
  tracker: ImplementationProgressTracker,
): Promise<void> {
  const tasks = subtaskIds.map((stId) => {
    const subtask = card.subtasks.find((s) => s.id === stId);
    return { stId, title: subtask?.title ?? stId };
  });

  const results = await Promise.allSettled(
    tasks.map(async (t) => {
      const taskPrompt = buildSubtaskPrompt(card, t.stId);

      const result = await deps.subagentManager.runSingle({
        task: taskPrompt,
        systemPrompt: IMPLEMENTER_SYSTEM_PROMPT,
        parentSessionId,
        workspaceId: deps.workspaceId,
        cwd: worktreePath,
        isolated: true,
        onUpdate: (text) => tracker.addLogLine(text),
      });

      if (result.startsWith('Error:')) {
        await updateSubtaskStatuses(stateFilePath, card.id, [t.stId], 'failed');
        tracker.completeAgent(t.title, 'failed');
        throw new Error(result);
      }

      const checkpointId = await createCheckpointInWorktree(
        worktreePath, `subtask: ${t.title}`,
      );
      await markSubtaskCompleted(stateFilePath, card.id, t.stId, checkpointId);
      tracker.completeAgent(t.title, 'completed');
      return result;
    }),
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    const msgs = failures.map((f) => (f as PromiseRejectedResult).reason?.message ?? 'unknown');
    throw new Error(`${failures.length} parallel subtask(s) failed: ${msgs.join('; ')}`);
  }
}

// ── State Helpers ───────────────────────────────────────────

async function updateSubtaskStatuses(
  stateFilePath: string,
  cardId: string,
  subtaskIds: string[],
  status: 'pending' | 'in-progress' | 'completed' | 'failed',
): Promise<void> {
  const raw = await appStateManager.read(stateFilePath) as KanbanState | null;
  if (!raw) return;
  const cards = raw.cards.map((c) => {
    if (c.id !== cardId) return c;
    return {
      ...c,
      subtasks: c.subtasks.map((s) =>
        subtaskIds.includes(s.id) ? { ...s, status } : s,
      ),
      updatedAt: new Date().toISOString(),
    };
  });
  await appStateManager.write(stateFilePath, { ...raw, cards });
}

async function markSubtaskCompleted(
  stateFilePath: string,
  cardId: string,
  subtaskId: string,
  checkpointId: string | null,
): Promise<void> {
  const raw = await appStateManager.read(stateFilePath) as KanbanState | null;
  if (!raw) return;
  const cards = raw.cards.map((c) => {
    if (c.id !== cardId) return c;
    return {
      ...c,
      subtasks: c.subtasks.map((s) =>
        s.id === subtaskId
          ? { ...s, status: 'completed' as const, checkpointId: checkpointId ?? undefined }
          : s,
      ),
      lastCheckpoint: checkpointId ?? c.lastCheckpoint,
      updatedAt: new Date().toISOString(),
    };
  });
  await appStateManager.write(stateFilePath, { ...raw, cards });
}
