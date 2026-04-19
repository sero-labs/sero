import type { Card } from '@sero/common';
import type {
  ReviewIssue,
  ReviewPromptOptions,
  ReviewRevisionPromptOptions,
} from './review-types';

const DIFF_PATCH_LIMIT = 32_000;

function truncatePatch(diff: string, suffix: string): string {
  return diff.length > DIFF_PATCH_LIMIT
    ? `${diff.slice(0, DIFF_PATCH_LIMIT)}\n\n${suffix}`
    : diff;
}

export function buildReviewPrompt(
  card: Card,
  diff: string,
  fileSummary: string,
  options?: ReviewPromptOptions,
): string {
  const patch = truncatePatch(diff, `...[patch truncated at ${DIFF_PATCH_LIMIT} chars]`);
  const testNote = options?.testingEnabled === false
    ? '\nNote: Testing is disabled for this workspace — do not flag missing test coverage.\n'
    : '';
  const lightModeNote = options?.reviewMode === 'light'
    ? '\nLight prototype mode is active. Keep the review narrow: focus on obvious blockers to user testing, compile/startup failures, or fundamentally broken behavior. Do not comb through every file for polish, and do not use browser automation.\n'
    : '';
  const subtaskSummary = card.subtasks.length > 0
    ? `\n## Subtask Summary\n${card.subtasks.map((subtask) => `- ${subtask.title} (${subtask.status})`).join('\n')}\n`
    : '';

  return `Review the following implementation for this card:

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((item) => `- ${item}`).join('\n')}` : ''}
${card.plan ? `\nImplementation Plan:\n${card.plan}` : ''}
${subtaskSummary}
# Changed Files
${fileSummary || '(no files changed)'}

# Diff
${patch || '(no diff available)'}
${testNote}${lightModeNote}
Categorise each issue as Critical (blocks merge), Important (should fix but doesn't block), or Minor (nice-to-have).
Provide an explicit verdict: "merge" (ready), "fix-first" (has critical issues), or "reject" (fundamentally wrong approach).

PR FORMAT — this is a FEATURE PR, not a review report:
- prTitle: "feat: <what was built>" (e.g. "feat: core snake game with canvas rendering and input handling")
- prBody sections: ## Summary (what this delivers to the user), ## Changes (per subtask, what was implemented), ## Review Notes (any issues found), ## Manual Testing (what the user should verify — especially interactive/real-time features that can't be tested via automation)

Do NOT use browser automation to test interactive/real-time features (games, animations, etc.) — it is too slow. Note them for manual testing instead.

When the review is complete, call the \`kanban_submit_review\` tool with this exact shape:

\`\`\`
{
  "approved": false,
  "summary": "Short overall assessment",
  "verdict": "merge | fix-first | reject",
  "categorizedIssues": [
    {
      "description": "What is wrong",
      "severity": "critical | important | minor",
      "file": "src/path.ts",
      "line": 12,
      "suggestion": "Concrete fix"
    }
  ],
  "issues": ["Optional legacy string issue list"],
  "prTitle": "feat: what was built",
  "prBody": "## Summary\\n...\\n\\n## Changes\\n...\\n\\n## Review Notes\\n...\\n\\n## Manual Testing\\n..."
}
\`\`\`

Rules:
- Set "approved" to false for "fix-first" or "reject"
- Use "critical" only for merge-blocking issues
- If there are no issues, return an empty categorizedIssues array
- The tool submission is the authoritative result
- Do not emit the final review as raw JSON in normal text after calling the tool`;
}

export function buildReviewRevisionPrompt(
  card: Card,
  criticalIssues: ReviewIssue[],
  summary?: string,
  options?: ReviewRevisionPromptOptions,
): string {
  const issueBlock = criticalIssues.map((issue, index) => {
    const location = issue.file
      ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})`
      : '';
    const suggestion = issue.suggestion ? `\n  Suggested fix: ${issue.suggestion}` : '';
    return `${index + 1}. ${issue.description}${location}${suggestion}`;
  }).join('\n');
  const testingNote = options?.testingEnabled === false
    ? '\nTesting is disabled for this workspace — do not add broad new test coverage in this pass unless a listed issue explicitly requires it.\n'
    : '';
  const lightModeNote = options?.reviewMode === 'light'
    ? '\nLight prototype mode is active. Make the smallest change that restores a working prototype. Avoid broad retesting and do NOT use browser automation unless the issue explicitly requires a narrow smoke check.\n'
    : '';

  return `You are fixing merge-blocking review feedback for an existing feature branch.

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.plan ? `\nImplementation Plan:\n${card.plan}` : ''}
${summary ? `\nReview Summary:\n${summary}` : ''}

## Critical Issues To Fix
${issueBlock}
${testingNote}${lightModeNote}

## Instructions
- Fix ONLY the critical issues listed above in this pass
- Keep the existing feature intent intact
- Do not start dev servers or long-running processes
- Run only the checks needed to validate your fixes
- When done, briefly summarize what you changed to address the review`;
}
