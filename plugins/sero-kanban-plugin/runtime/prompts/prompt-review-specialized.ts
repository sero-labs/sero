import type { Card, ReviewMode } from '@sero/common';

const DIFF_PATCH_LIMIT = 32_000;

interface SpecializedReviewPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
}

export function buildSpecReviewPrompt(
  card: Card,
  subtaskId: string,
  diff: string,
  options?: SpecializedReviewPromptOptions,
): string {
  const subtask = card.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) throw new Error(`Subtask ${subtaskId} not found on card #${card.id}`);

  const patch = diff.length > DIFF_PATCH_LIMIT
    ? `${diff.slice(0, DIFF_PATCH_LIMIT)}\n\n...[truncated]`
    : diff;
  const lightModeNote = options?.reviewMode === 'light'
    ? '\nLight prototype mode is active. Focus only on obvious spec mismatches that would block user testing, and do not use browser automation.\n'
    : '';
  const testingNote = options?.testingEnabled === false
    ? '\nTesting is disabled for this workspace — do not flag missing automated tests.\n'
    : '';

  return `Compare this implementation against the subtask specification:

# Subtask: ${subtask.title}
${subtask.description}
${subtask.filePaths?.length ? `\nExpected files: ${subtask.filePaths.join(', ')}` : ''}

# Parent Card: ${card.title}
${card.acceptance.length > 0 ? `Acceptance Criteria:\n${card.acceptance.map((a) => `- ${a}`).join('\n')}` : ''}

# Implementation Diff
${patch || '(no diff)'}
${testingNote}${lightModeNote}
Review for spec compliance. Output valid JSON as specified in your instructions.`;
}

function buildQualityReviewPrompt(
  card: Card,
  diff: string,
  fileSummary: string,
  options?: SpecializedReviewPromptOptions,
): string {
  const patch = diff.length > DIFF_PATCH_LIMIT
    ? `${diff.slice(0, DIFF_PATCH_LIMIT)}\n\n...[truncated]`
    : diff;
  const lightModeNote = options?.reviewMode === 'light'
    ? '\nLight prototype mode is active. Keep this pass narrow: obvious correctness or startup blockers only, and do not use browser automation.\n'
    : '';
  const testingNote = options?.testingEnabled === false
    ? '\nTesting is disabled for this workspace — do not flag missing automated tests.\n'
    : '';

  return `Review this implementation for code quality:

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}

# Changed Files
${fileSummary || '(no files changed)'}

# Implementation Diff
${patch || '(no diff)'}
${testingNote}${lightModeNote}
Review for code quality concerns. Output valid JSON as specified in your instructions.`;
}
