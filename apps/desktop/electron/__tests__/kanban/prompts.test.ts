/**
 * Tests for prompt builders and parsers — plan parsing, review parsing, prompt generation.
 */

import { describe, it, expect } from 'vitest';
import {
  buildImplementationPrompt,
  parsePlanResult,
  parseReviewResult,
  buildSubtaskPrompt,
  buildSubtaskGenerationPrompt,
  buildReviewPrompt,
  buildReviewRevisionPrompt,
  buildSpecReviewPrompt,
} from '../../kanban/prompts';
import { buildConflictResolutionPrompt } from '../../kanban/prompt-conflict-resolution';
import { buildLightReviewRepairPrompt } from '../../kanban/prompt-light-review-repair';
import type { Card } from '../../kanban/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Test feature',
    description: 'Implement test feature',
    acceptance: ['Feature works', 'Tests pass'],
    priority: 'medium',
    column: 'planning',
    status: 'waiting-input',
    subtasks: [
      { id: '1', title: 'Setup', description: 'Project setup', status: 'completed', dependsOn: [] },
      { id: '2', title: 'Implement', description: 'Core logic', status: 'pending', dependsOn: ['1'] },
    ],
    plan: 'Build it step by step',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── parsePlanResult ──────────────────────────────────────────

describe('parsePlanResult', () => {
  it('parses valid JSON with plan and subtasks', () => {
    const raw = '```json\n{"plan": "Do X then Y", "subtasks": [{"id": "1", "title": "First", "description": "Do first thing", "dependsOn": []}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.plan).toBe('Do X then Y');
    expect(result.subtasks).toHaveLength(1);
    expect(result.subtasks[0].title).toBe('First');
    expect(result.subtasks[0].status).toBe('pending');
    expect(result.warnings).toHaveLength(0);
  });

  it('parses new TDD/file fields', () => {
    const raw = '```json\n{"plan": "TDD approach", "subtasks": [{"id": "1", "title": "Tests", "description": "Write tests", "dependsOn": [], "tddDesignation": "tdd", "filePaths": ["src/utils.ts", "src/utils.test.ts"], "complexity": "medium"}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.subtasks[0].tddDesignation).toBe('tdd');
    expect(result.subtasks[0].filePaths).toEqual(['src/utils.ts', 'src/utils.test.ts']);
    expect(result.subtasks[0].complexity).toBe('medium');
  });

  it('ignores invalid TDD designation values', () => {
    const raw = '```json\n{"plan": "X", "subtasks": [{"id": "1", "title": "T", "description": "D", "dependsOn": [], "tddDesignation": "invalid"}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.subtasks[0].tddDesignation).toBeUndefined();
  });

  it('ignores invalid complexity values', () => {
    const raw = '```json\n{"plan": "X", "subtasks": [{"id": "1", "title": "T", "description": "D", "dependsOn": [], "complexity": "extreme"}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.subtasks[0].complexity).toBeUndefined();
  });

  it('returns warnings for invalid dependency references', () => {
    const raw = '```json\n{"plan": "X", "subtasks": [{"id": "1", "title": "T", "description": "D", "dependsOn": ["99"]}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('99');
  });

  it('handles no JSON block gracefully', () => {
    const result = parsePlanResult('Just some random text without JSON');
    expect(result.plan).toBe('Just some random text without JSON');
    expect(result.subtasks).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('handles malformed JSON gracefully', () => {
    const result = parsePlanResult('```json\n{invalid json}\n```');
    expect(result.subtasks).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('generates IDs when missing from subtasks', () => {
    const raw = '```json\n{"plan": "X", "subtasks": [{"title": "A", "description": "D1", "dependsOn": []}, {"title": "B", "description": "D2", "dependsOn": []}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.subtasks[0].id).toBe('1');
    expect(result.subtasks[1].id).toBe('2');
  });

  it('defaults subtask status to pending', () => {
    const raw = '```json\n{"plan": "X", "subtasks": [{"id": "1", "title": "T", "description": "D", "dependsOn": [], "status": "completed"}]}\n```';
    const result = parsePlanResult(raw);
    expect(result.subtasks[0].status).toBe('pending');
  });
});

// ── parseReviewResult ────────────────────────────────────────

describe('parseReviewResult', () => {
  it('parses valid review JSON', () => {
    const raw = '```json\n{"approved": true, "summary": "Good", "issues": [], "prTitle": "feat: add X", "prBody": "## Summary\\nDoes X"}\n```';
    const result = parseReviewResult(raw);
    expect(result.approved).toBe(true);
    expect(result.prTitle).toBe('feat: add X');
    expect(result.issues).toHaveLength(0);
  });

  it('parses structured categorized issues', () => {
    const raw = '```json\n{"approved": false, "summary": "Issues found", "issues": ["Bug"], "categorizedIssues": [{"description": "Bug in foo", "severity": "critical", "file": "src/foo.ts", "line": 42}], "verdict": "fix-first", "prTitle": "fix: bugs", "prBody": "Fix"}\n```';
    const result = parseReviewResult(raw);
    expect(result.categorizedIssues).toHaveLength(1);
    expect(result.categorizedIssues![0].severity).toBe('critical');
    expect(result.categorizedIssues![0].file).toBe('src/foo.ts');
    expect(result.verdict).toBe('fix-first');
  });

  it('normalizes object issues from the legacy issues array', () => {
    const raw = '```json\n{"approved": false, "summary": "Issues found", "issues": [{"description": "Missing import", "severity": "critical", "file": "src/App.tsx", "line": 3}], "verdict": "fix-first", "prTitle": "fix: bugs", "prBody": "Fix"}\n```';
    const result = parseReviewResult(raw);
    expect(result.issues).toEqual(['Missing import']);
    expect(result.categorizedIssues).toHaveLength(1);
    expect(result.categorizedIssues![0].severity).toBe('critical');
    expect(result.approved).toBe(false);
  });

  it('handles missing categorizedIssues', () => {
    const raw = '```json\n{"approved": true, "summary": "OK", "issues": [], "prTitle": "T", "prBody": "B"}\n```';
    const result = parseReviewResult(raw);
    expect(result.categorizedIssues).toBeUndefined();
    expect(result.verdict).toBeUndefined();
  });

  it('clamps prTitle to 72 chars', () => {
    const longTitle = 'a'.repeat(100);
    const raw = `\`\`\`json\n{"approved": true, "summary": "X", "issues": [], "prTitle": "${longTitle}", "prBody": "B"}\n\`\`\``;
    const result = parseReviewResult(raw);
    expect(result.prTitle.length).toBe(72);
  });

  it('defaults to approved when no JSON found', () => {
    const result = parseReviewResult('No JSON here');
    expect(result.approved).toBe(true);
    expect(result.prTitle).toBe('feat: implementation');
  });

  it('uses card title in fallback prTitle', () => {
    const result = parseReviewResult('No JSON here', 'Add user dashboard');
    expect(result.prTitle).toBe('feat: add user dashboard');
  });

  it('detects raw markdown verdicts when JSON is missing', () => {
    const result = parseReviewResult('Verdict: `fix-first`\n1. Missing import in src/App.tsx');
    expect(result.verdict).toBe('fix-first');
    expect(result.approved).toBe(false);
    expect(result.issues).toContain('Missing import in src/App.tsx');
  });

  it('defaults approved to true when field is missing', () => {
    const raw = '```json\n{"summary": "OK", "issues": [], "prTitle": "T", "prBody": "B"}\n```';
    const result = parseReviewResult(raw);
    expect(result.approved).toBe(true);
  });

  it('rejects invalid verdict values', () => {
    const raw = '```json\n{"approved": true, "summary": "X", "issues": [], "prTitle": "T", "prBody": "B", "verdict": "maybe"}\n```';
    const result = parseReviewResult(raw);
    expect(result.verdict).toBeUndefined();
  });
});

// ── buildSubtaskPrompt ───────────────────────────────────────

describe('buildSubtaskPrompt', () => {
  it('throws for non-existent subtask', () => {
    const card = makeCard();
    expect(() => buildSubtaskPrompt(card, '999')).toThrow('Subtask 999 not found');
  });

  it('includes completed subtask context with file paths', () => {
    const card = makeCard({
      subtasks: [
        { id: '1', title: 'Setup', description: 'Init', status: 'completed', dependsOn: [], filePaths: ['src/init.ts'] },
        { id: '2', title: 'Build', description: 'Core', status: 'pending', dependsOn: ['1'] },
      ],
    });
    const prompt = buildSubtaskPrompt(card, '2');
    expect(prompt).toContain('✅ Setup');
    expect(prompt).toContain('src/init.ts');
  });

  it('explains that non-empty worktrees are expected for scaffolders', () => {
    const card = makeCard({
      subtasks: [
        { id: '1', title: 'Scaffold project', description: 'Init Vite app', status: 'pending', dependsOn: [] },
      ],
    });
    const prompt = buildSubtaskPrompt(card, '1');
    expect(prompt).toContain('worktree directory is not empty');
    expect(prompt).toContain('normal workaround');
  });

  it('includes TDD instructions when enabled', () => {
    const card = makeCard({
      subtasks: [
        { id: '1', title: 'Test', description: 'Write tests', status: 'pending', dependsOn: [], tddDesignation: 'tdd' },
      ],
    });
    const prompt = buildSubtaskPrompt(card, '1', { testingEnabled: true });
    expect(prompt).toContain('tdd');
    expect(prompt).toContain('failing test first');
  });

  it('omits TDD instructions when testing disabled', () => {
    const card = makeCard({
      subtasks: [
        { id: '1', title: 'Test', description: 'Write tests', status: 'pending', dependsOn: [], tddDesignation: 'tdd' },
      ],
    });
    const prompt = buildSubtaskPrompt(card, '1', { testingEnabled: false });
    expect(prompt).toContain('disabled');
  });

  it('uses lighter evaluation guidance in light review mode', () => {
    const card = makeCard({
      subtasks: [
        { id: '1', title: 'Prototype UI', description: 'Ship the prototype quickly', status: 'pending', dependsOn: [] },
      ],
    });
    const prompt = buildSubtaskPrompt(card, '1', { testingEnabled: false, reviewMode: 'light' });
    expect(prompt).toContain('working prototype');
    expect(prompt).toContain('Do NOT use browser automation');
    expect(prompt).toContain('minimum evaluation');
  });
});

// ── buildImplementationPrompt ───────────────────────────────

describe('buildImplementationPrompt', () => {
  it('frames subtasks as one cohesive implementation pass', () => {
    const prompt = buildImplementationPrompt(makeCard());
    expect(prompt).toContain('one cohesive pass');
    expect(prompt).toContain('NOT separate agent assignments');
    expect(prompt).toContain('Use the subtasks to structure your work');
    expect(prompt).toContain('kanban_mark_subtask_complete');
    expect(prompt).toContain('Do not simulate progress by printing marker text');
  });

  it('uses lighter guidance for prototype delivery mode', () => {
    const prompt = buildImplementationPrompt(makeCard(), {
      testingEnabled: false,
      reviewMode: 'light',
    });

    expect(prompt).toContain('working prototype');
    expect(prompt).toContain('Do NOT use browser automation');
    expect(prompt).toContain('Testing is disabled');
  });
});

describe('buildConflictResolutionPrompt', () => {
  it('describes the rebase context and conflicted files', () => {
    const prompt = buildConflictResolutionPrompt(
      makeCard(),
      'main',
      ['src/App.tsx', 'src/index.css'],
    );
    expect(prompt).toContain('rebased onto the latest `main`');
    expect(prompt).toContain('src/App.tsx');
    expect(prompt).toContain('src/index.css');
    expect(prompt).toContain('Do not run `git rebase`');
  });

  it('keeps prototype conflict resolution lightweight in light mode', () => {
    const prompt = buildConflictResolutionPrompt(
      makeCard(),
      'main',
      ['src/App.tsx'],
      { reviewMode: 'light' },
    );
    expect(prompt).toContain('Light prototype mode is active');
    expect(prompt).toContain('Do NOT do broad browser automation');
    expect(prompt).toContain('smallest safe edit');
  });
});

describe('buildLightReviewRepairPrompt', () => {
  it('focuses the implementer on the reported smoke failure', () => {
    const prompt = buildLightReviewRepairPrompt(
      makeCard(),
      'Light review compile check failed:\ntsconfig error here',
    );
    expect(prompt).toContain('Light review compile check failed');
    expect(prompt).toContain('Fix only the issue(s) needed');
    expect(prompt).toContain('Do not run `git commit`');
  });

  it('keeps repair guidance narrow in light mode', () => {
    const prompt = buildLightReviewRepairPrompt(
      makeCard(),
      'Dev server smoke check failed',
      { reviewMode: 'light' },
    );
    expect(prompt).toContain('Prototype light mode is active');
    expect(prompt).toContain('smallest safe change');
    expect(prompt).toContain('Do NOT do browser automation');
  });
});

// ── buildSubtaskGenerationPrompt ─────────────────────────────

describe('buildSubtaskGenerationPrompt', () => {
  it('includes TDD instructions when enabled', () => {
    const card = makeCard();
    const prompt = buildSubtaskGenerationPrompt(card, 'analysis...', { testingEnabled: true });
    expect(prompt).toContain('tddDesignation');
    expect(prompt).toContain('tdd');
    expect(prompt).toContain('kanban_submit_plan');
  });

  it('disables TDD when testing is off', () => {
    const card = makeCard();
    const prompt = buildSubtaskGenerationPrompt(card, 'analysis...', { testingEnabled: false });
    expect(prompt).toContain('no-test');
    expect(prompt).toContain('disabled');
    expect(prompt).toContain('Do not return the final plan as raw JSON');
  });
});

// ── buildReviewPrompt ────────────────────────────────────────

describe('buildReviewPrompt', () => {
  it('includes subtask summary in review', () => {
    const card = makeCard();
    const prompt = buildReviewPrompt(card, 'diff...', 'file summary...');
    expect(prompt).toContain('Subtask Summary');
    expect(prompt).toContain('Setup');
  });

  it('includes testing disabled note when testing is off', () => {
    const card = makeCard();
    const prompt = buildReviewPrompt(card, 'diff', 'files', { testingEnabled: false });
    expect(prompt).toContain('disabled');
    expect(prompt).toContain('do not flag missing test coverage');
  });

  it('narrows the review scope in light review mode', () => {
    const card = makeCard();
    const prompt = buildReviewPrompt(card, 'diff', 'files', { reviewMode: 'light' });
    expect(prompt).toContain('Keep the review narrow');
    expect(prompt).toContain('do not use browser automation');
  });

  it('includes the structured review tool schema', () => {
    const card = makeCard();
    const prompt = buildReviewPrompt(card, 'diff', 'files');
    expect(prompt).toContain('"categorizedIssues"');
    expect(prompt).toContain('kanban_submit_review');
    expect(prompt).toContain('authoritative result');
  });

  it('truncates long diffs', () => {
    const card = makeCard();
    const longDiff = 'x'.repeat(50000);
    const prompt = buildReviewPrompt(card, longDiff, 'files');
    expect(prompt).toContain('truncated');
    expect(prompt.length).toBeLessThan(50000);
  });

  it('tells the reviewer not to emit raw JSON after tool submission', () => {
    const card = makeCard();
    const prompt = buildReviewPrompt(card, 'diff', 'files');
    expect(prompt).toContain('Do not emit the final review as raw JSON');
  });
});

describe('buildReviewRevisionPrompt', () => {
  it('focuses the implementer on critical issues only', () => {
    const card = makeCard({ column: 'review' });
    const prompt = buildReviewRevisionPrompt(card, [
      {
        description: 'Import is missing',
        severity: 'critical',
        file: 'src/App.tsx',
        line: 3,
        suggestion: 'Add the missing import at the top of the file.',
      },
    ], 'Reviewer found one blocking issue.');

    expect(prompt).toContain('Critical Issues To Fix');
    expect(prompt).toContain('Import is missing');
    expect(prompt).toContain('src/App.tsx:3');
    expect(prompt).toContain('Fix ONLY the critical issues listed above');
  });

  it('keeps revision guidance minimal in light review mode', () => {
    const card = makeCard({ column: 'review' });
    const prompt = buildReviewRevisionPrompt(card, [
      { description: 'Fix startup crash', severity: 'critical' },
    ], 'Reviewer found one blocking issue.', { testingEnabled: false, reviewMode: 'light' });

    expect(prompt).toContain('smallest change');
    expect(prompt).toContain('do NOT use browser automation');
    expect(prompt).toContain('Testing is disabled');
  });
});

// ── buildSpecReviewPrompt ────────────────────────────────────

describe('buildSpecReviewPrompt', () => {
  it('throws for non-existent subtask', () => {
    const card = makeCard();
    expect(() => buildSpecReviewPrompt(card, '999', 'diff')).toThrow();
  });

  it('includes subtask spec and file paths', () => {
    const card = makeCard({
      subtasks: [
        { id: '1', title: 'Build', description: 'Build the thing', status: 'completed', dependsOn: [], filePaths: ['src/thing.ts'] },
      ],
    });
    const prompt = buildSpecReviewPrompt(card, '1', 'diff data');
    expect(prompt).toContain('Build the thing');
    expect(prompt).toContain('src/thing.ts');
  });
});
