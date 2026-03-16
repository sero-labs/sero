import type { Card, KanbanSettings, KanbanState } from './types';
import type { ImplementationProgressTracker } from './implementation-progress';
import { buildImplementationPrompt } from './prompt-implementation';
import { bridgeSubagentLiveOutput } from './live-output-bridge';
import { shouldUseLightReview } from './light-review';
import { createCheckpointInWorktree } from './worktree-git';
import {
  detectVerificationCommands,
  runVerificationCommands,
  summarizeVerificationFailure,
} from './verification';
import { runWorkspaceCommand } from './workspace-command-runner';
import { appStateManager } from '../app-state';
import type { SubagentManager } from '../subagent/index';

export interface ImplementationExecutorDeps {
  subagentManager: SubagentManager;
  workspaceId: string;
  settings?: KanbanSettings;
}

interface ExecutionHooks {
  createCheckpoint?: (worktreePath: string, label: string) => Promise<string | null>;
  runVerification?: (
    workspaceId: string,
    worktreePath: string,
    tracker: ImplementationProgressTracker,
    settings?: KanbanSettings,
  ) => Promise<void>;
}

export async function executeImplementation(
  deps: ImplementationExecutorDeps,
  stateFilePath: string,
  card: Card,
  worktreePath: string,
  tracker: ImplementationProgressTracker,
  hooks: ExecutionHooks = {},
): Promise<void> {
  const parentSessionId = `kanban-impl-${card.id}`;
  const detachLiveOutput = bridgeSubagentLiveOutput(
    deps.subagentManager,
    deps.workspaceId,
    parentSessionId,
    tracker,
  );

  try {
    const subtaskIds = card.subtasks.map((subtask) => subtask.id);
    tracker.setPhase('Implementing plan');
    tracker.addAgent('implementer');
    await updateSubtaskStatuses(stateFilePath, card.id, subtaskIds, 'in-progress');
    await tracker.flush();

    const result = await deps.subagentManager.runSingleStructured({
      agent: 'implementer',
      task: buildImplementationPrompt(card, {
        testingEnabled: deps.settings?.testingEnabled,
        reviewMode: deps.settings?.reviewMode,
      }),
      parentSessionId,
      workspaceId: deps.workspaceId,
      cwd: worktreePath,
      isolated: true,
      onUpdate: (text) => tracker.addLogLine(text),
    });

    if (result.error) {
      throw new Error(result.error);
    }

    if (shouldUseLightReview(deps.settings)) {
      tracker.addLogLine('Light prototype mode — skipping implementation-phase verification.');
    } else {
      const runVerification = hooks.runVerification ?? runImplementationVerification;
      await runVerification(deps.workspaceId, worktreePath, tracker, deps.settings);
    }

    const createCheckpoint = hooks.createCheckpoint ?? createCheckpointInWorktree;
    const checkpointId = await createCheckpoint(worktreePath, `implementation: ${card.title}`);
    await markImplementationCompleted(stateFilePath, card.id, checkpointId);
    tracker.completeAgent('implementer');
    await tracker.flush();
  } catch (err) {
    await updateIncompleteSubtasks(stateFilePath, card.id, 'failed');
    tracker.completeAgent('implementer', 'failed');
    await tracker.flush();
    throw err;
  } finally {
    detachLiveOutput();
  }
}

async function updateSubtaskStatuses(
  stateFilePath: string,
  cardId: string,
  subtaskIds: string[],
  status: 'pending' | 'in-progress' | 'completed' | 'failed',
): Promise<void> {
  if (subtaskIds.length === 0) return;
  await appStateManager.update<KanbanState>(stateFilePath, (raw) => {
    if (!raw) return fallbackState();
    return {
      ...raw,
      cards: raw.cards.map((card) => {
        if (card.id !== cardId) return card;
        return {
          ...card,
          subtasks: card.subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id) ? { ...subtask, status } : subtask,
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });
}

async function updateIncompleteSubtasks(
  stateFilePath: string,
  cardId: string,
  status: 'failed',
): Promise<void> {
  await appStateManager.update<KanbanState>(stateFilePath, (raw) => {
    if (!raw) return fallbackState();
    return {
      ...raw,
      cards: raw.cards.map((card) => {
        if (card.id !== cardId) return card;
        return {
          ...card,
          subtasks: card.subtasks.map((subtask) =>
            subtask.status === 'completed' ? subtask : { ...subtask, status },
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });
}

async function markImplementationCompleted(
  stateFilePath: string,
  cardId: string,
  checkpointId: string | null,
): Promise<void> {
  await appStateManager.update<KanbanState>(stateFilePath, (raw) => {
    if (!raw) return fallbackState();
    return {
      ...raw,
      cards: raw.cards.map((card) => {
        if (card.id !== cardId) return card;
        return {
          ...card,
          subtasks: card.subtasks.map((subtask) => ({
            ...subtask,
            status: 'completed' as const,
            checkpointId: checkpointId ?? undefined,
          })),
          lastCheckpoint: checkpointId ?? card.lastCheckpoint,
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });
}

async function runImplementationVerification(
  workspaceId: string,
  worktreePath: string,
  tracker: ImplementationProgressTracker,
  settings?: KanbanSettings,
): Promise<void> {
  const commands = await detectVerificationCommands(worktreePath, {
    testingEnabled: settings?.testingEnabled,
  });
  if (commands.length === 0) return;

  tracker.setPhase('Verifying implementation');
  await tracker.flush();

  const result = await runVerificationCommands(worktreePath, commands, undefined, {
    runCommand: (command, cwd, timeoutMs) =>
      runWorkspaceCommand(workspaceId, cwd, command, timeoutMs, { isolated: true }),
  });
  if (!result.success) {
    const failed = result.results.find((entry) => !entry.success);
    throw new Error(
      failed
        ? `Implementation verification failed: ${summarizeVerificationFailure(failed)}`
        : 'Implementation verification failed.',
    );
  }
}

function fallbackState(): KanbanState {
  return {
    cards: [],
    nextId: 1,
    settings: {
      autoAdvance: true,
      maxConcurrentCards: 3,
      requireApproval: { plan: true, pr: true },
      reviewLevel: 'per-wave',
      reviewMode: 'full',
      testingEnabled: true,
      yoloMode: false,
    },
  };
}
