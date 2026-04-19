import type { ReviewResult } from '../../prompts';
import type { Card, KanbanSettings } from '../../core/types';
import type { ReviewProgressTracker } from '../state/review-progress';
import type { KanbanRuntimeHost } from '../../types';

interface LightReviewDeps {
  host: KanbanRuntimeHost;
  workspaceId: string;
  settings?: KanbanSettings;
}

interface LightReviewCheck {
  label: string;
  command: string;
  note: string;
}

export interface LightReviewResult {
  success: boolean;
  review?: ReviewResult;
  error?: string;
}

export function shouldUseLightReview(settings?: KanbanSettings): boolean {
  return settings?.testingEnabled === false && (settings?.reviewMode ?? 'full') === 'light';
}

export async function executeLightReview(
  deps: LightReviewDeps,
  card: Card,
  worktreePath: string,
  tracker: ReviewProgressTracker,
): Promise<LightReviewResult> {
  const checks: LightReviewCheck[] = [];

  const compileCommands = await deps.host.verification.detectCompileCommands(worktreePath);
  if (compileCommands.length > 0) {
    tracker.setPhase('Running compile checks');
    await tracker.flush();

    const compileResult = await deps.host.verification.runCommands(
      deps.workspaceId,
      worktreePath,
      compileCommands,
      undefined,
      { isolated: true },
    );
    if (!compileResult.success) {
      const failed = compileResult.results.find((result) => !result.success);
      return {
        success: false,
        error: failed
          ? `Light review compile check failed:\n${deps.host.verification.summarizeFailure(failed)}`
          : 'Light review compile check failed.',
      };
    }

    checks.push(...compileResult.results.map((result) => ({
      label: 'Compile check',
      command: result.command,
      note: `Passed in ${formatDuration(result.durationMs)}.`,
    })));
  }

  const devServerCommand = await deps.host.verification.detectDevServerCommand(worktreePath);
  if (devServerCommand) {
    tracker.setPhase('Checking dev server startup');
    await tracker.flush();

    const devServerResult = await deps.host.verification.runDevServerSmokeCheck(
      deps.workspaceId,
      worktreePath,
      devServerCommand,
      { isolated: true },
    );
    if (!devServerResult.success) {
      return {
        success: false,
        error: `Light review dev server check failed:\n${deps.host.verification.summarizeFailure(devServerResult)}`,
      };
    }

    checks.push({
      label: 'Dev server smoke check',
      command: devServerCommand,
      note: 'Server started without an immediate crash.',
    });
  }

  return {
    success: true,
    review: buildLightReviewArtifact(card, checks),
  };
}

function buildLightReviewArtifact(card: Card, checks: LightReviewCheck[]): ReviewResult {
  const normalizedTitle = normalizePrTitle(card.title);
  const subtaskLines = card.subtasks.length > 0
    ? card.subtasks.map((subtask) => `- ${subtask.title}: ${subtask.description || 'Implemented.'}`)
    : [card.description ? `- ${card.description}` : `- ${card.title}`];
  const reviewLines = checks.length > 0
    ? [
        '- Prototype light review mode used: skipped full reviewer diff analysis to get this ready for user testing faster.',
        ...checks.map((check) => `- ${check.label}: \`${check.command}\` — ${check.note}`),
      ]
    : [
        '- Prototype light review mode used: skipped full reviewer diff analysis to get this ready for user testing faster.',
        '- No compile/build or dev-server smoke commands were detected automatically in this workspace.',
      ];
  const manualTestingLines = card.acceptance.length > 0
    ? card.acceptance.map((criterion) => `- ${criterion}`)
    : ['- Exercise the changed workflow end-to-end in the app.'];

  return {
    approved: true,
    summary: checks.length > 0
      ? `Prototype light review passed: ${checks.map((check) => check.label.toLowerCase()).join(' and ')}.`
      : 'Prototype light review completed with no automated smoke checks detected.',
    issues: [],
    categorizedIssues: [],
    verdict: 'merge',
    prTitle: `feat: ${normalizedTitle}`.slice(0, 72),
    prBody: [
      '## Summary',
      `- ${card.title}`,
      '- Ready for prototype user testing with a lightweight smoke review.',
      '',
      '## Changes',
      ...subtaskLines,
      '',
      '## Review Notes',
      ...reviewLines,
      '',
      '## Manual Testing',
      ...manualTestingLines,
    ].join('\n'),
  };
}

function normalizePrTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || 'prototype implementation';
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}
