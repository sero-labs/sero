/**
 * Kanban prompt builders and plan parser.
 *
 * Builds the prompts used for planning-phase subagents and parses
 * the structured JSON plan result into subtasks.
 *
 * Extracted from orchestrator.ts for file size compliance.
 */

import type { Card, ReviewMode } from './types';
export { buildSpecReviewPrompt, buildQualityReviewPrompt } from './prompt-review-specialized';

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

export interface PlanGenerationOptions {
  testingEnabled?: boolean;
}

export function buildSubtaskGenerationPrompt(
  card: Card,
  analysisResults: string,
  options?: PlanGenerationOptions,
): string {
  const testingEnabled = options?.testingEnabled !== false;
  const tddBlock = testingEnabled
    ? `- Designate each subtask's testing approach:
  - "tdd": Write tests first, then implement (for core logic, utilities, data transformations)
  - "test-after": Implement first, then write tests (for integration, UI wiring)
  - "no-test": No tests needed (for config, scaffolding, documentation)
- Include a dedicated test-writing subtask when the feature has testable logic`
    : `- Set tddDesignation to "no-test" for all subtasks (testing is disabled for this workspace)`;

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
      "dependsOn": [],
      "tddDesignation": "tdd | test-after | no-test",
      "filePaths": ["src/path/to/file.ts"],
      "complexity": "low | medium | high"
    }
  ]
}
\`\`\`

Rules for subtasks:
- 2-8 subtasks is ideal, each scoped to 15-30 minutes of agent work
- Each subtask should be independently implementable where possible
- Use dependsOn to specify ordering constraints (array of subtask IDs)
- Parallelisable subtasks should have empty dependsOn arrays
- List exact file paths each subtask creates or modifies (for parallel conflict detection)
- Estimate complexity: low (~15min), medium (~30min), high (~45min+)
${tddBlock}
- Keep descriptions concise but specific`;
}

// ── Implementation Prompts ───────────────────────────────────

export interface SubtaskPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
}

export function buildSubtaskPrompt(
  card: Card,
  subtaskId: string,
  options?: SubtaskPromptOptions,
): string {
  const subtask = card.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) throw new Error(`Subtask ${subtaskId} not found on card #${card.id}`);

  const testingEnabled = options?.testingEnabled !== false;

  const completedSubtasks = card.subtasks
    .filter((s) => s.status === 'completed')
    .map((s) => {
      const files = s.filePaths?.length ? ` (files: ${s.filePaths.join(', ')})` : '';
      return `- ✅ ${s.title}: ${s.description}${files}`;
    })
    .join('\n');

  const tddBlock = testingEnabled && subtask.tddDesignation && subtask.tddDesignation !== 'no-test'
    ? `\n## Testing Approach: ${subtask.tddDesignation}\n${subtask.tddDesignation === 'tdd'
      ? 'Write a failing test first, then implement to make it pass.'
      : 'Implement first, then write tests covering the core logic.'}\n`
    : testingEnabled ? '' : '\nNote: Testing is disabled for this workspace — do not write tests.\n';
  const lightModeBlock = options?.reviewMode === 'light'
    ? '\n## Prototype Delivery Mode\nLight prototype mode is active. Prioritise a working prototype the user can test quickly.\n- Do only the minimum evaluation needed to avoid obvious breakage\n- Do NOT use browser automation or exhaustive UI interaction testing unless the user explicitly asked for it\n- Leave deeper validation, polish, and broad edge-case hunting for later passes\n'
    : '';

  const filePathsBlock = subtask.filePaths?.length
    ? `\nExpected file paths: ${subtask.filePaths.join(', ')}\n`
    : '';

  return `You are implementing a specific subtask as part of a larger feature.

# Overall Feature: ${card.title}
${card.description ? `\n${card.description}\n` : ''}
## Implementation Plan
${card.plan ?? '(no plan provided)'}

## Your Subtask
**${subtask.title}**
${subtask.description}
${filePathsBlock}${tddBlock}${lightModeBlock}
${completedSubtasks ? `## Already Completed\n${completedSubtasks}\n` : ''}
## Instructions
- Focus ONLY on this subtask — do not implement other subtasks
- Do not read from or rely on \`.sero/\` files or other kanban card worktrees; they are orchestration state, not product source files
- Write clean, well-typed code following existing project conventions
- Create or modify files as needed for this subtask
- If a scaffolder/init tool refuses to run because the worktree directory is not empty, treat that as expected for git worktrees: scaffold in a temporary directory and describe it as a normal workaround, not as a failure
- Do not run the dev server or start any long-running processes
- When done, provide a brief summary of what you implemented`;
}

// ── Review Prompts ───────────────────────────────────────────

const DIFF_PATCH_LIMIT = 32_000;

export interface ReviewPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
}

export function buildReviewPrompt(
  card: Card,
  diff: string,
  fileSummary: string,
  options?: ReviewPromptOptions,
): string {
  const patch = diff.length > DIFF_PATCH_LIMIT
    ? `${diff.slice(0, DIFF_PATCH_LIMIT)}\n\n...[patch truncated at ${DIFF_PATCH_LIMIT} chars]`
    : diff;

  const testNote = options?.testingEnabled === false
    ? '\nNote: Testing is disabled for this workspace — do not flag missing test coverage.\n'
    : '';
  const lightModeNote = options?.reviewMode === 'light'
    ? '\nLight prototype mode is active. Keep the review narrow: focus on obvious blockers to user testing, compile/startup failures, or fundamentally broken behavior. Do not comb through every file for polish, and do not use browser automation.\n'
    : '';

  const subtaskSummary = card.subtasks.length > 0
    ? `\n## Subtask Summary\n${card.subtasks.map((s) => `- ${s.title} (${s.status})`).join('\n')}\n`
    : '';

  return `Review the following implementation for this card:

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((a) => `- ${a}`).join('\n')}` : ''}
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

Return ONLY valid JSON with this exact shape:

\`\`\`json
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
- Do not wrap the JSON in prose or markdown commentary`;
}

export interface ReviewRevisionPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
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

export interface ReviewIssue {
  description: string;
  severity: 'critical' | 'important' | 'minor';
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  /** Legacy flat issues list (backward compat) */
  issues: string[];
  /** Structured issue categories */
  categorizedIssues?: ReviewIssue[];
  /** Explicit verdict: 'merge' | 'fix-first' | 'reject' */
  verdict?: 'merge' | 'fix-first' | 'reject';
  prTitle: string;
  prBody: string;
}

export function parseReviewResult(raw: string, cardTitle?: string): ReviewResult {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/)
    || raw.match(/\{[\s\S]*"prTitle"[\s\S]*"prBody"[\s\S]*\}/);

  const fallbackTitle = cardTitle
    ? `feat: ${cardTitle.toLowerCase().slice(0, 65)}`
    : 'feat: implementation';

  const fb: ReviewResult = {
    approved: true,
    summary: raw.slice(0, 500),
    issues: [],
    prTitle: fallbackTitle,
    prBody: raw.slice(0, 2000),
  };

  if (!jsonMatch) {
    return buildRawReviewFallback(raw, fb);
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Parse structured issues if present
    let categorizedIssues: ReviewIssue[] | undefined;
    if (Array.isArray(parsed.categorizedIssues)) {
      categorizedIssues = parsed.categorizedIssues
        .filter((i: unknown) => i && typeof i === 'object')
        .map((i: Record<string, unknown>) => normalizeReviewIssue(i));
    }

    if ((!categorizedIssues || categorizedIssues.length === 0) && Array.isArray(parsed.issues)) {
      const objectIssues = parsed.issues
        .filter((issue: unknown) => issue && typeof issue === 'object')
        .map((issue: Record<string, unknown>) => normalizeReviewIssue(issue));
      if (objectIssues.length > 0) {
        categorizedIssues = objectIssues;
      }
    }

    // Parse verdict
    const validVerdicts = new Set(['merge', 'fix-first', 'reject']);
    const verdict = validVerdicts.has(parsed.verdict) ? parsed.verdict : undefined;

    return {
      approved: parsed.approved !== false && verdict !== 'fix-first' && verdict !== 'reject',
      summary: typeof parsed.summary === 'string' ? parsed.summary : fb.summary,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(normalizeReviewIssueText) : [],
      categorizedIssues,
      verdict,
      prTitle: typeof parsed.prTitle === 'string'
        ? parsed.prTitle.slice(0, 72)
        : fb.prTitle,
      prBody: typeof parsed.prBody === 'string' ? parsed.prBody : fb.prBody,
    };
  } catch {
    return buildRawReviewFallback(raw, fb);
  }
}

function buildRawReviewFallback(raw: string, fb: ReviewResult): ReviewResult {
  const verdict = parseRawVerdict(raw);
  const issues = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
    .filter(Boolean)
    .slice(0, 5);

  return {
    ...fb,
    approved: verdict ? verdict === 'merge' : true,
    verdict,
    issues,
  };
}

function parseRawVerdict(raw: string): ReviewResult['verdict'] | undefined {
  const match = raw.match(/verdict[:\s`*-]+(merge|fix-first|reject)/i);
  return match ? match[1].toLowerCase() as ReviewResult['verdict'] : undefined;
}

function normalizeReviewIssueText(issue: unknown): string {
  if (typeof issue === 'string') return issue;
  if (issue && typeof issue === 'object') {
    const value = issue as Record<string, unknown>;
    return typeof value.description === 'string'
      ? value.description
      : JSON.stringify(value);
  }
  return String(issue);
}

function normalizeReviewIssue(issue: Record<string, unknown>): ReviewIssue {
  return {
    description: typeof issue.description === 'string' ? issue.description : normalizeReviewIssueText(issue),
    severity: normalizeReviewSeverity(issue.severity),
    file: typeof issue.file === 'string' ? issue.file : undefined,
    line: typeof issue.line === 'number' ? issue.line : undefined,
    suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : undefined,
  };
}

function normalizeReviewSeverity(raw: unknown): ReviewIssue['severity'] {
  const severity = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (severity === 'critical') return 'critical';
  if (severity === 'important' || severity === 'warning') return 'important';
  return 'minor';
}

// ── Plan Parser ──────────────────────────────────────────────

const VALID_TDD = new Set(['tdd', 'test-after', 'no-test']);
const VALID_COMPLEXITY = new Set(['low', 'medium', 'high']);

export interface PlanResult {
  plan: string;
  subtasks: Card['subtasks'];
  /** Validation warnings (non-blocking) about the plan structure */
  warnings: string[];
}

export function parsePlanResult(raw: string): PlanResult {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*"plan"[\s\S]*"subtasks"[\s\S]*\}/);

  if (!jsonMatch) {
    return { plan: raw.slice(0, 2000), subtasks: [], warnings: ['No JSON block found in planner output'] };
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const plan = typeof parsed.plan === 'string' ? parsed.plan : raw.slice(0, 2000);
    const subtasks: Card['subtasks'] = [];
    const warnings: string[] = [];

    if (Array.isArray(parsed.subtasks)) {
      for (const st of parsed.subtasks) {
        const tdd = VALID_TDD.has(st.tddDesignation) ? st.tddDesignation : undefined;
        const complexity = VALID_COMPLEXITY.has(st.complexity) ? st.complexity : undefined;
        const filePaths = Array.isArray(st.filePaths) ? st.filePaths.map(String) : undefined;

        subtasks.push({
          id: String(st.id || subtasks.length + 1),
          title: String(st.title || 'Untitled subtask'),
          description: String(st.description || ''),
          status: 'pending',
          dependsOn: Array.isArray(st.dependsOn) ? st.dependsOn.map(String) : [],
          tddDesignation: tdd,
          filePaths,
          complexity,
        });
      }
    }

    // Validate plan structure
    const validIds = new Set(subtasks.map((s) => s.id));
    for (const st of subtasks) {
      for (const dep of st.dependsOn) {
        if (!validIds.has(dep)) {
          warnings.push(`Subtask "${st.id}" depends on non-existent subtask "${dep}"`);
        }
      }
    }

    return { plan, subtasks, warnings };
  } catch {
    return { plan: raw.slice(0, 2000), subtasks: [], warnings: ['Failed to parse planner JSON output'] };
  }
}
