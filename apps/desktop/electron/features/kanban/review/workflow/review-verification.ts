import {
  detectVerificationCommands,
  runVerificationCommands,
  summarizeVerificationFailure,
} from '@electron/features/kanban/quality/verification';
import { runWorkspaceCommand } from '@electron/features/kanban/workspace/workspace-command-runner';
import type { KanbanSettings } from '@electron/features/kanban/core/types';
import type { ReviewProgressTracker } from '../state/review-progress';

export async function runReviewVerification(
  workspaceId: string,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  settings?: KanbanSettings,
): Promise<string | null> {
  const verifyCommands = await detectVerificationCommands(worktreePath, {
    testingEnabled: settings?.testingEnabled,
  });
  if (verifyCommands.length === 0) {
    return null;
  }

  tracker.setPhase('Running verification');
  await tracker.flush();

  const verifyResult = await runVerificationCommands(worktreePath, verifyCommands, undefined, {
    runCommand: (command, cwd, timeoutMs) =>
      runWorkspaceCommand(workspaceId, cwd, command, timeoutMs, { isolated: true }),
  });
  if (verifyResult.success) {
    return null;
  }

  const failed = verifyResult.results.find((result) => !result.success);
  const errOutput = failed ? summarizeVerificationFailure(failed) : 'Unknown verification failure';
  return `Pre-review verification failed:\n${errOutput}`;
}
