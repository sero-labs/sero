import { createDefaultKanbanState } from '../../shared/types';
import type { Card, KanbanSettings, KanbanState, Subtask } from '../core/types';
import type { KanbanRuntimeHost } from '../types';
import type { ImplementationProgressTracker } from './implementation-progress';
import { createImplementationProgressTool } from './implementation-progress-tool';
import { buildImplementationPrompt } from '../prompts/prompt-implementation';
import { bridgeSubagentLiveOutput } from './live-output-bridge';
import { shouldUseLightReview } from '../review/workflow/light-review';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

export interface ImplementationExecutorDeps {
  host: KanbanRuntimeHost;
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
    deps.host,
    deps.workspaceId,
    parentSessionId,
    tracker,
  );
  const progressBridge = bridgeSubtaskProgress(
    deps.host,
    deps.workspaceId,
    parentSessionId,
    stateFilePath,
    card,
  );

  try {
    tracker.setPhase('Implementing plan');
    tracker.addAgent('implementer');
    await initializeSubtaskExecution(deps.host, stateFilePath, card.id);
    await tracker.flush();

    const result = await deps.host.subagents.runStructured({
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
      const runVerification = hooks.runVerification
        ?? ((workspaceId, verificationWorktreePath, verificationTracker, settings) =>
          runImplementationVerification(
            deps.host,
            workspaceId,
            verificationWorktreePath,
            verificationTracker,
            settings,
          ));
      await runVerification(deps.workspaceId, worktreePath, tracker, deps.settings);
    }

    const createCheckpoint = hooks.createCheckpoint
      ?? ((checkpointWorktreePath, label) => deps.host.git.createCheckpoint(checkpointWorktreePath, label));
    const checkpointId = await createCheckpoint(worktreePath, `implementation: ${card.title}`);
    await markImplementationCompleted(deps.host, stateFilePath, card.id, checkpointId);
    tracker.completeAgent('implementer');
    await tracker.flush();
  } catch (error) {
    progressBridge.stop();
    await progressBridge.drain();
    await updateIncompleteSubtasks(deps.host, stateFilePath, card.id, 'failed');
    tracker.completeAgent('implementer', 'failed');
    await tracker.flush();
    throw error;
  } finally {
    progressBridge.stop();
    detachLiveOutput();
  }
}

function bridgeSubtaskProgress(
  host: Pick<KanbanRuntimeHost, 'appState' | 'subagents'>,
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
      await markSubtaskCompleted(host, stateFilePath, card.id, subtaskId);
    }).catch((error) => {
      console.warn(`[kanban-implementation] Failed to record subtask progress for #${card.id}:`, error);
    });
    await queue;
    return 'recorded';
  }

  const detachLiveOutput = host.subagents.onLiveOutput(
    workspaceId,
    parentSessionId,
    (_agentName, text) => {
      if (stopped) return;
      const nextIds = extractCompletedSubtaskIds(text)
        .filter((subtaskId) => !reported.has(subtaskId));
      if (nextIds.length === 0) return;

      for (const subtaskId of nextIds) {
        void recordSubtaskCompletion(subtaskId).catch((error) => {
          console.warn(`[kanban-implementation] Failed to record subtask progress for #${card.id}:`, error);
        });
      }
    },
  );

  return {
    tools: [
      createImplementationProgressTool({
        markSubtaskComplete: recordSubtaskCompletion,
      }),
    ],
    stop() {
      if (stopped) return;
      stopped = true;
      detachLiveOutput();
    },
    async drain() {
      await queue;
    },
  };
}

async function initializeSubtaskExecution(
  host: Pick<KanbanRuntimeHost, 'appState'>,
  stateFilePath: string,
  cardId: string,
): Promise<void> {
  await host.appState.update<KanbanState>(stateFilePath, (raw) => {
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
  host: Pick<KanbanRuntimeHost, 'appState'>,
  stateFilePath: string,
  cardId: string,
  completedSubtaskId: string,
): Promise<void> {
  await host.appState.update<KanbanState>(stateFilePath, (raw) => {
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
  host: Pick<KanbanRuntimeHost, 'appState'>,
  stateFilePath: string,
  cardId: string,
  status: 'failed',
): Promise<void> {
  await host.appState.update<KanbanState>(stateFilePath, (raw) => {
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
  host: Pick<KanbanRuntimeHost, 'appState'>,
  stateFilePath: string,
  cardId: string,
  checkpointId: string | null,
): Promise<void> {
  await host.appState.update<KanbanState>(stateFilePath, (raw) => {
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
  host: Pick<KanbanRuntimeHost, 'verification'>,
  workspaceId: string,
  worktreePath: string,
  tracker: ImplementationProgressTracker,
  settings?: KanbanSettings,
): Promise<void> {
  const commands = await host.verification.detectVerificationCommands(worktreePath, {
    testingEnabled: settings?.testingEnabled,
  });
  if (commands.length === 0) return;

  tracker.setPhase('Verifying implementation');
  await tracker.flush();

  const result = await host.verification.runCommands(
    workspaceId,
    worktreePath,
    commands,
    undefined,
    { isolated: true },
  );
  if (!result.success) {
    const failed = result.results.find((entry) => !entry.success);
    throw new Error(
      failed
        ? `Implementation verification failed: ${host.verification.summarizeFailure(failed)}`
        : 'Implementation verification failed.',
    );
  }
}

function fallbackState(): KanbanState {
  return createDefaultKanbanState();
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

