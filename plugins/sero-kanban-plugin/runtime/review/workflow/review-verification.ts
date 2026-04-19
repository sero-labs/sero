import type { KanbanSettings } from '../../core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import type { KanbanRuntimeHost } from '../../types';

export async function runReviewVerification(
  host: KanbanRuntimeHost,
  workspaceId: string,
  worktreePath: string,
  tracker: ReviewProgressTracker,
  settings?: KanbanSettings,
): Promise<string | null> {
  const verifyCommands = await host.verification.detectVerificationCommands(worktreePath, {
    testingEnabled: settings?.testingEnabled,
  });
  if (verifyCommands.length === 0) {
    return null;
  }

  tracker.setPhase('Running verification');
  await tracker.flush();

  const verifyResult = await host.verification.runCommands(
    workspaceId,
    worktreePath,
    verifyCommands,
    undefined,
    { isolated: true },
  );
  if (verifyResult.success) {
    return null;
  }

  const failed = verifyResult.results.find((result) => !result.success);
  const errOutput = failed ? host.verification.summarizeFailure(failed) : 'Unknown verification failure';
  return `Pre-review verification failed:\n${errOutput}`;
}
