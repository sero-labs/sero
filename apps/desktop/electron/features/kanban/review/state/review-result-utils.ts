import { getContract } from '../../core/contracts';
import type { ReviewIssue, ReviewResult } from '../../prompts';

export function hasMalformedLegacyIssues(review: Partial<ReviewResult>): boolean {
  return Array.isArray(review.issues)
    && review.issues.some((issue) => (
      typeof issue !== 'string'
      || issue.includes('[object Object]')
    ));
}

export function getBlockingReviewFailure(review: ReviewResult): string | null {
  const criticalIssues = review.categorizedIssues?.filter((issue) => issue.severity === 'critical') ?? [];
  const verdictBlocks = review.verdict === 'fix-first' || review.verdict === 'reject';
  const reviewBlocks = review.approved === false || verdictBlocks || criticalIssues.length > 0;

  if (!reviewBlocks) return null;

  const issueLines = criticalIssues.length > 0
    ? criticalIssues
      .slice(0, 3)
      .map((issue) => {
        const location = issue.file
          ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})`
          : '';
        return `- ${issue.description}${location}`;
      })
      .join('\n')
    : review.issues.slice(0, 3).map((issue) => `- ${issue}`).join('\n');

  const summary = review.summary.trim() || 'Reviewer did not approve this implementation.';
  return issueLines ? `${summary}\n${issueLines}` : summary;
}

export function requiresReviewerApproval(): boolean {
  return getContract('in-progress', 'review')?.qualityGates.some((gate) => (
    gate.type === 'agent-review'
    && gate.agent === 'reviewer'
    && gate.blocking
  )) === true;
}

export function getCriticalIssues(review: ReviewResult): ReviewIssue[] {
  return review.categorizedIssues?.filter((issue) => issue.severity === 'critical') ?? [];
}
