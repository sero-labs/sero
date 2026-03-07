/**
 * Kanban prompt builders and plan parser.
 *
 * Builds the prompts used for planning-phase subagents and parses
 * the structured JSON plan result into subtasks.
 *
 * Extracted from orchestrator.ts for file size compliance.
 */

import type { Card } from './types';

// ── Workspace Isolation ──────────────────────────────────────

const WORKSPACE_SCOPE_DIRECTIVE = `
IMPORTANT: You are scoped to THIS workspace only. Do NOT access, read, write,
or reference files outside the current working directory. Never use absolute
paths to other workspaces or home directories.`.trim();

// ── Planning Prompts ─────────────────────────────────────────

export function buildPlanningPrompt(card: Card): string {
  let prompt = `# Task: ${card.title}\n\n`;

  if (card.description) {
    prompt += `## Description\n${card.description}\n\n`;
  }

  if (card.acceptance.length > 0) {
    prompt += `## Acceptance Criteria\n`;
    for (const ac of card.acceptance) {
      prompt += `- ${ac}\n`;
    }
    prompt += '\n';
  }

  prompt += `Priority: ${card.priority}\n`;
  return prompt;
}

export function buildSubtaskGenerationPrompt(card: Card, analysisResults: string): string {
  return `Based on the following codebase analysis, create a detailed implementation plan with subtasks for this card:

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((a) => `- ${a}`).join('\n')}` : ''}

# Codebase Analysis
${analysisResults}

# Instructions
Generate a structured implementation plan. Output ONLY a JSON object with this exact shape:

\`\`\`json
{
  "plan": "A 2-4 paragraph description of the implementation approach",
  "subtasks": [
    {
      "id": "1",
      "title": "Short title for this subtask",
      "description": "What this subtask involves",
      "dependsOn": []
    }
  ]
}
\`\`\`

Rules for subtasks:
- 2-8 subtasks is ideal
- Each subtask should be independently implementable where possible
- Use dependsOn to specify ordering constraints (array of subtask IDs)
- Parallelisable subtasks should have empty dependsOn arrays
- Include a final "write tests" subtask if applicable
- Keep descriptions concise but specific`;
}

export const PLANNER_SYSTEM_PROMPT = `You are a senior software architect specialising in breaking down development tasks into implementable subtasks.

You analyse codebase context and produce structured implementation plans with:
- Clear subtask breakdown with dependencies
- Non-overlapping file scopes per subtask (for parallel execution)
- Realistic scope estimates

Always output valid JSON matching the requested schema. No markdown outside the JSON block.

${WORKSPACE_SCOPE_DIRECTIVE}`;

// ── Implementation Prompts ───────────────────────────────────

export function buildSubtaskPrompt(card: Card, subtaskId: string): string {
  const subtask = card.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) throw new Error(`Subtask ${subtaskId} not found on card #${card.id}`);

  const completedSubtasks = card.subtasks
    .filter((s) => s.status === 'completed')
    .map((s) => `- ✅ ${s.title}: ${s.description}`)
    .join('\n');

  return `You are implementing a specific subtask as part of a larger feature.

# Overall Feature: ${card.title}
${card.description ? `\n${card.description}\n` : ''}
## Implementation Plan
${card.plan ?? '(no plan provided)'}

## Your Subtask
**${subtask.title}**
${subtask.description}

${completedSubtasks ? `## Already Completed\n${completedSubtasks}\n` : ''}
## Instructions
- Focus ONLY on this subtask — do not implement other subtasks
- Write clean, well-typed code following existing project conventions
- Create or modify files as needed for this subtask
- Do not run the dev server or start any long-running processes
- When done, provide a brief summary of what you implemented`;
}

// ── Review Prompts ───────────────────────────────────────────

export const REVIEWER_SYSTEM_PROMPT = `You are a senior code reviewer. You review diffs thoroughly and produce a structured review with a PR title and description.

${WORKSPACE_SCOPE_DIRECTIVE}

Your review covers:
1. Code quality and correctness
2. Adherence to existing patterns and conventions
3. Potential bugs or edge cases
4. Test coverage gaps
5. Performance concerns

Output ONLY valid JSON with this exact shape:
\`\`\`json
{
  "approved": true,
  "summary": "Brief overall assessment",
  "issues": ["Issue 1 description", "Issue 2 description"],
  "prTitle": "conventional-commit style PR title (max 72 chars)",
  "prBody": "Markdown PR description with Summary, Changes, and Testing sections"
}
\`\`\`

If the code is acceptable, set approved to true with an empty issues array.
If there are blocking issues, set approved to false.`;

const DIFF_PATCH_LIMIT = 32_000;

export function buildReviewPrompt(card: Card, diff: string, fileSummary: string): string {
  const patch = diff.length > DIFF_PATCH_LIMIT
    ? `${diff.slice(0, DIFF_PATCH_LIMIT)}\n\n...[patch truncated at ${DIFF_PATCH_LIMIT} chars]`
    : diff;

  return `Review the following implementation for this card:

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((a) => `- ${a}`).join('\n')}` : ''}
${card.plan ? `\nImplementation Plan:\n${card.plan}` : ''}

# Changed Files
${fileSummary || '(no files changed)'}

# Diff
${patch || '(no diff available)'}

Review the code and generate a PR title and description. Output valid JSON as specified.`;
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  issues: string[];
  prTitle: string;
  prBody: string;
}

export function parseReviewResult(raw: string): ReviewResult {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/)
    || raw.match(/\{[\s\S]*"prTitle"[\s\S]*"prBody"[\s\S]*\}/);

  const fallback: ReviewResult = {
    approved: true,
    summary: raw.slice(0, 500),
    issues: [],
    prTitle: 'chore: update from kanban card',
    prBody: raw.slice(0, 2000),
  };

  if (!jsonMatch) return fallback;

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return {
      approved: parsed.approved !== false,
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      prTitle: typeof parsed.prTitle === 'string'
        ? parsed.prTitle.slice(0, 72)
        : fallback.prTitle,
      prBody: typeof parsed.prBody === 'string' ? parsed.prBody : fallback.prBody,
    };
  } catch {
    return fallback;
  }
}

// ── Plan Parser ──────────────────────────────────────────────

export function parsePlanResult(raw: string): {
  plan: string;
  subtasks: Card['subtasks'];
} {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*"plan"[\s\S]*"subtasks"[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      plan: raw.slice(0, 2000),
      subtasks: [],
    };
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const plan = typeof parsed.plan === 'string' ? parsed.plan : raw.slice(0, 2000);
    const subtasks: Card['subtasks'] = [];

    if (Array.isArray(parsed.subtasks)) {
      for (const st of parsed.subtasks) {
        subtasks.push({
          id: String(st.id || subtasks.length + 1),
          title: String(st.title || 'Untitled subtask'),
          description: String(st.description || ''),
          status: 'pending',
          dependsOn: Array.isArray(st.dependsOn) ? st.dependsOn.map(String) : [],
        });
      }
    }

    return { plan, subtasks };
  } catch {
    return {
      plan: raw.slice(0, 2000),
      subtasks: [],
    };
  }
}
