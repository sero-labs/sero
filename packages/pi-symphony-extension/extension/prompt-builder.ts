/**
 * Prompt rendering — renders the workflow template with issue context.
 *
 * First turn: full rendered prompt from template.
 * Continuation turns: brief continuation guidance.
 */

import type { Issue } from '../shared/types';
import { renderTemplate } from '../shared/template';

const DEFAULT_PROMPT = 'You are working on an issue. Please review and implement the required changes.';

const CONTINUATION_PREFIX = 'Continue working on the issue. Previous turn completed. ';

// ── Public API ─────────────────────────────────────────────────

export function buildPrompt(
  promptTemplate: string,
  issue: Issue,
  attempt: number,
  turnNumber: number,
): string {
  // Continuation turns get a brief message, not the full template
  if (turnNumber > 1) {
    return `${CONTINUATION_PREFIX}Issue: ${issue.identifier} — ${issue.title}. Turn ${turnNumber}, attempt ${attempt}.`;
  }

  // Empty template → use default
  if (!promptTemplate.trim()) {
    return DEFAULT_PROMPT;
  }

  const context = {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
      priority: issue.priority,
      state: issue.state,
      branchName: issue.branchName ?? '',
      url: issue.url ?? '',
      labels: issue.labels,
      blockedBy: issue.blockedBy,
      createdAt: issue.createdAt ?? '',
      updatedAt: issue.updatedAt ?? '',
    },
    attempt: String(attempt),
  };

  try {
    return renderTemplate(promptTemplate, context, { strict: false });
  } catch {
    // Fallback if template rendering fails
    return `${DEFAULT_PROMPT}\n\nIssue: ${issue.identifier} — ${issue.title}\n${issue.description ?? ''}`;
  }
}
