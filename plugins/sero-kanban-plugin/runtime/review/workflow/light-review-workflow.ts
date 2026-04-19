import { executeLightReview } from './light-review';
import type { LightReviewResult } from './light-review';
import { buildLightReviewRepairPrompt } from '../../prompts/prompt-light-review-repair';
import type { Card, KanbanSettings } from '../../core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import type { KanbanRuntimeHost } from '../../types';

const MAX_LIGHT_REPAIR_ATTEMPTS = 1;

interface LightReviewWorkflowDeps {
  host: KanbanRuntimeHost;
  workspaceId: string;
  settings?: KanbanSettings;
}

interface RepairResult {
  success: boolean;
  error?: string;
}

interface LightReviewWorkflowInternals {
  executeReview?: (
    deps: { host: KanbanRuntimeHost; workspaceId: string; settings?: KanbanSettings },
    card: Card,
    worktreePath: string,
    tracker: ReviewProgressTracker,
  ) => Promise<LightReviewResult>;
  repairFailure?: (
    deps: LightReviewWorkflowDeps,
    card: Card,
    worktreePath: string,
    tracker: ReviewProgressTracker,
    parentSessionId: string,
    failure: string,
    attempt: number,
  ) => Promise<RepairResult>;
}

export async function runLightReviewWorkflow(
  deps: LightReviewWorkflowDeps,
  card: Card,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  parentSessionId: string,
  internals: LightReviewWorkflowInternals = {},
): Promise<LightReviewResult> {
  const executeReview = internals.executeReview ?? executeLightReview;
  const repairFailure = internals.repairFailure ?? repairLightReviewFailure;

  let result = await executeReview(
    { host: deps.host, workspaceId: deps.workspaceId, settings: deps.settings },
    card,
    worktreePath,
    tracker,
  );
  if (result.success && result.review) return result;

  let failure = result.error ?? 'Light review failed.';
  for (let attempt = 1; attempt <= MAX_LIGHT_REPAIR_ATTEMPTS; attempt++) {
    const repair = await repairFailure(
      deps,
      card,
      worktreePath,
      tracker,
      parentSessionId,
      failure,
      attempt,
    );
    if (!repair.success) {
      return { success: false, error: repair.error ?? failure };
    }

    tracker.addLogLine('Re-running light review smoke checks after automatic repair.');
    result = await executeReview(
      { host: deps.host, workspaceId: deps.workspaceId, settings: deps.settings },
      card,
      worktreePath,
      tracker,
    );
    if (result.success && result.review) return result;

    failure = result.error ?? 'Light review failed after automatic repair.';
  }

  return { success: false, error: failure };
}

async function repairLightReviewFailure(
  deps: LightReviewWorkflowDeps,
  card: Card,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  parentSessionId: string,
  failure: string,
  attempt: number,
): Promise<RepairResult> {
  const agentLabel = `implementer (light repair ${attempt})`;
  tracker.setPhase(`Fixing light review failure (${attempt}/${MAX_LIGHT_REPAIR_ATTEMPTS})`);
  tracker.addAgent(agentLabel);
  await tracker.flush();

  const result = await deps.host.subagents.runStructured({
    agent: 'implementer',
    task: buildLightReviewRepairPrompt(card, failure, {
      reviewMode: deps.settings?.reviewMode,
    }),
    parentSessionId,
    workspaceId: deps.workspaceId,
    cwd: worktreePath,
    isolated: true,
    onUpdate: (text) => tracker.addLogLine(text),
  });

  tracker.completeAgent(agentLabel, result.error ? 'failed' : 'completed');
  if (result.error) {
    return {
      success: false,
      error: `Light review repair failed: ${result.error}`,
    };
  }

  return { success: true };
}
