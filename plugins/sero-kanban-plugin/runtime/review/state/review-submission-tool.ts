import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type, type Static } from '@sinclair/typebox';
import type { ReviewIssue, ReviewResult } from '../../prompts';

const ReviewIssueParams = Type.Object({
  description: Type.String({ minLength: 1, description: 'Issue description.' }),
  severity: Type.Union([
    Type.Literal('critical'),
    Type.Literal('important'),
    Type.Literal('minor'),
  ]),
  file: Type.Optional(Type.String()),
  line: Type.Optional(Type.Number()),
  suggestion: Type.Optional(Type.String()),
});

const SubmitReviewParams = Type.Object({
  approved: Type.Boolean({ description: 'Whether the reviewer approved the change.' }),
  summary: Type.String({ minLength: 1, description: 'Short overall assessment.' }),
  verdict: Type.Union([
    Type.Literal('merge'),
    Type.Literal('fix-first'),
    Type.Literal('reject'),
  ]),
  categorizedIssues: Type.Array(ReviewIssueParams, {
    description: 'Structured issues found during review.',
  }),
  issues: Type.Optional(Type.Array(Type.String())),
  prTitle: Type.String({ minLength: 1, description: 'PR title for the feature branch.' }),
  prBody: Type.String({ minLength: 1, description: 'PR body markdown.' }),
});

type SubmittedReviewParams = Static<typeof SubmitReviewParams>;

export interface ReviewSubmissionToolHandlers {
  submitReview: (review: ReviewResult) => Promise<'recorded' | 'updated'>;
}

function normalizeReviewSubmission(
  params: SubmittedReviewParams,
  cardTitle?: string,
): ReviewResult {
  const fallbackTitle = cardTitle
    ? `feat: ${cardTitle.toLowerCase().slice(0, 65)}`
    : 'feat: implementation';
  const categorizedIssues: ReviewIssue[] = params.categorizedIssues.map((issue) => ({
    description: issue.description,
    severity: issue.severity,
    file: issue.file,
    line: typeof issue.line === 'number' ? issue.line : undefined,
    suggestion: issue.suggestion,
  }));

  return {
    approved: params.approved !== false && params.verdict === 'merge',
    summary: params.summary,
    issues: Array.isArray(params.issues) && params.issues.length > 0
      ? params.issues.map((issue) => issue.trim()).filter(Boolean)
      : categorizedIssues.map((issue) => issue.description),
    categorizedIssues,
    verdict: params.verdict,
    prTitle: params.prTitle.trim().slice(0, 72) || fallbackTitle,
    prBody: params.prBody,
  };
}

export function createReviewSubmissionTool(
  cardTitle: string | undefined,
  handlers: ReviewSubmissionToolHandlers,
): ToolDefinition {
  return {
    name: 'kanban_submit_review',
    label: 'Kanban Submit Review',
    description: 'Submit the structured review verdict, issues, and PR metadata for the current kanban card.',
    parameters: SubmitReviewParams,
    async execute(_toolCallId, params) {
      const review = normalizeReviewSubmission(params as SubmittedReviewParams, cardTitle);
      const outcome = await handlers.submitReview(review);
      return {
        content: [{
          type: 'text',
          text: outcome === 'updated'
            ? 'Updated the structured kanban review submission.'
            : 'Recorded the structured kanban review submission.',
        }],
        details: {
          outcome,
          verdict: review.verdict,
          issueCount: review.categorizedIssues?.length ?? 0,
        },
      };
    },
  };
}
