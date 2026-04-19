import { createDefaultKanbanState } from '@sero/common';

import type { Card, KanbanSettings, KanbanState, Subtask } from '../core/types';
import type { ImplementationProgressTracker } from './implementation-progress';
import { createImplementationProgressTool } from './implementation-progress-tool';
import { buildImplementationPrompt } from '../prompts/prompt-implementation';
import { bridgeSubagentLiveOutput } from './live-output-bridge';
import { shouldUseLightReview } from '../review/workflow/light-review';
import { createCheckpointInWorktree } from '@electron/features/vcs/worktree/git';
import {
  detectVerificationCommands,
  runVerificationCommands,
  summarizeVerificationFailure,
} from '@electron/features/workspace/runtime/verification';
import { runWorkspaceCommand } from '@electron/features/workspace/runtime/run-workspace-command';
import { appStateManager } from '@electron/features/apps/state/manager';
import type { SubagentManager } from '@electron/features/subagent';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

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

interface ProgressBridge {
  tools: ToolDefinition[];
  stop(): void;
  drain(): Promise<void>;
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
  const progressBridge = bridgeSubtaskProgress(
    deps.subagentManager,
    deps.workspaceId,
    parentSessionId,
    stateFilePath,
    card,
  );

  try {
    tracker.setPhase('Implementing plan');
    tracker.addAgent('implementer');
    await initializeSubtaskExecution(stateFilePath, card.id);
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
      customTools: progressBridge.tools,
      onUpdate: (text) => tracker.addLogLine(text),
    });

    if (result.error) {
      throw new Error(result.error);
    }

    progressBridge.stop();
    await progressBridge.drain();

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
    progressBridge.stop();
    await progressBridge.drain();
    await updateIncompleteSubtasks(stateFilePath, card.id, 'failed');
    tracker.completeAgent('implementer', 'failed');
    await tracker.flush();
    throw err;
  } finally {
    progressBridge.stop();
    detachLiveOutput();
  }
}

function bridgeSubtaskProgress(
  subagentManager: SubagentManager,
  workspaceId: string,
  parentSessionId: string,
  stateFilePath: string,
  card: Card,
): ProgressBridge {
  const knownSubtasks = new Set(card.subtasks.map((subtask) => subtask.id));
  const reported = new Set<string>();
  let queue = Promise.resolve();
  let stopped = false;

  async function recordSubtaskCompletion(subtaskId: string): Promise<'recorded' | 'duplicate'> {
    if (stopped) {
      throw new Error('Implementation progress tracker is no longer active');
    }
    if (!knownSubtasks.has(subtaskId)) {
      throw new Error(
        `Unknown subtask ID '${subtaskId}'. Valid subtask IDs: ${Array.from(knownSubtasks).join(', ')}`,
      );
    }
    if (reported.has(subtaskId)) {
      return 'duplicate';
    }

    reported.add(subtaskId);
    queue = queue.then(async () => {
      if (stopped) return;
      await markSubtaskCompleted(stateFilePath, card.id, subtaskId);
    }).catch((error) => {
      console.warn(`[kanban-implementation] Failed to record subtask progress for #${card.id}:`, error);
    });
    await queue;
    return 'recorded';
  }

  const handleLiveOutput = (id: string, text: string) => {
    if (stopped) return;
    const entry = subagentManager.tracker.get(id);
    if (!matchesTrackedRun(entry, workspaceId, parentSessionId)) return;

    const nextIds = extractCompletedSubtaskIds(text)
      .filter((subtaskId) => !reported.has(subtaskId));
    if (nextIds.length === 0) return;

    for (const subtaskId of nextIds) {
      void recordSubtaskCompletion(subtaskId).catch((error) => {
        console.warn(`[kanban-implementation] Failed to record subtask progress for #${card.id}:`, error);
      });
    }
  };

  subagentManager.tracker.on('subagent_live_output', handleLiveOutput);

  return {
    tools: [
      createImplementationProgressTool({
        markSubtaskComplete: recordSubtaskCompletion,
      }),
    ],
    stop() {
      if (stopped) return;
      stopped = true;
      subagentManager.tracker.off('subagent_live_output', handleLiveOutput);
    },
    async drain() {
      await queue;
    },
  };
}

async function initializeSubtaskExecution(
  stateFilePath: string,
  cardId: string,
): Promise<void> {
  await appStateManager.update<KanbanState>(stateFilePath, (raw) => {
    if (!raw) return fallbackState();
    return {
      ...raw,
      cards: raw.cards.map((card) => {
        if (card.id !== cardId) return card;
        const nextSubtaskId = pickNextReadySubtask(card.subtasks);
        return {
          ...card,
          subtasks: card.subtasks.map((subtask) =>
            subtask.id === nextSubtaskId
              ? { ...subtask, status: 'in-progress' as const }
              : { ...subtask, status: 'pending' as const },
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });
}

async function markSubtaskCompleted(
  stateFilePath: string,
  cardId: string,
  completedSubtaskId: string,
): Promise<void> {
  await appStateManager.update<KanbanState>(stateFilePath, (raw) => {
    if (!raw) return fallbackState();
    return {
      ...raw,
      cards: raw.cards.map((card) => {
        if (card.id !== cardId) return card;

        const normalized = card.subtasks.map((subtask) => {
          if (subtask.id === completedSubtaskId) {
            return { ...subtask, status: 'completed' as const };
          }
          return subtask.status === 'in-progress'
            ? { ...subtask, status: 'pending' as const }
            : subtask;
        });

        const nextSubtaskId = pickNextReadySubtask(normalized);
        return {
          ...card,
          subtasks: normalized.map((subtask) =>
            subtask.id === nextSubtaskId
              ? { ...subtask, status: 'in-progress' as const }
              : subtask,
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
  return createDefaultKanbanState();
}

function matchesTrackedRun(
  entry: { workspaceId: string; parentSessionId: string } | undefined,
  workspaceId: string,
  parentSessionId: string,
): boolean {
  return entry?.workspaceId === workspaceId && entry.parentSessionId === parentSessionId;
}

function extractCompletedSubtaskIds(text: string): string[] {
  const matches = text.matchAll(/\bSUBTASK_COMPLETE(?:D)?\s*:\s*([A-Za-z0-9_-]+)/g);
  return Array.from(matches, (match) => match[1]);
}

function pickNextReadySubtask(subtasks: Subtask[]): string | null {
  const completed = new Set(
    subtasks
      .filter((subtask) => subtask.status === 'completed')
      .map((subtask) => subtask.id),
  );

  const ready = subtasks.find(
    (subtask) => subtask.status === 'pending' && subtask.dependsOn.every((dep) => completed.has(dep)),
  );
  if (ready) return ready.id;

  return subtasks.find((subtask) => subtask.status === 'pending')?.id ?? null;
}
