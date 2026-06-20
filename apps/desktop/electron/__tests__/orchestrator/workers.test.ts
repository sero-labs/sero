import { describe, expect, it } from 'vitest';

import {
  buildImplementerInstruction,
  parseWorkerOutput,
  toolPolicyForRole,
} from '@plugins/sero-orchestrator-plugin/runtime/workers';
import {
  DEFAULT_LOG_POLICY,
  DEFAULT_STOP_RULE,
  type LoopAttempt,
  type LoopGoal,
} from '@plugins/sero-orchestrator-plugin/shared/types';

function makeLoop(overrides: Partial<LoopGoal> = {}): LoopGoal {
  return {
    id: 'loop-1',
    workspaceId: 'ws',
    executionMode: 'background-worker',
    title: 'Fix the failing test',
    goal: 'Make the suite pass without breaking the public API.',
    status: 'active',
    triggers: [],
    checks: [],
    stopRule: DEFAULT_STOP_RULE,
    logPolicy: DEFAULT_LOG_POLICY,
    tasks: [],
    attempts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('worker tool policy (D-10)', () => {
  it('maps each role to its platform-tool surface', () => {
    expect(toolPolicyForRole('implementer')).toBe('all');
    expect(toolPolicyForRole('planner')).toBe('readOnly');
    expect(toolPolicyForRole('reviewer')).toBe('readOnly');
    expect(toolPolicyForRole('summarizer')).toBe('none');
  });
});

describe('buildImplementerInstruction (D-08)', () => {
  it('builds an implementer with write access and the fenced-JSON contract', () => {
    const instruction = buildImplementerInstruction({ loop: makeLoop() });
    expect(instruction.role).toBe('implementer');
    expect(instruction.platformTools).toBe('all');
    expect(instruction.systemPrompt).toMatch(/```json/);
    expect(instruction.systemPrompt).toMatch(/Do not commit/i);
    expect(instruction.outputSchema).toBeDefined();
    // The instruction never carries a cwd (D-06).
    expect(JSON.stringify(instruction)).not.toMatch(/workdir|cwd/i);
  });

  it('folds the goal, checks, and prior failure into the task prompt', () => {
    const priorAttempt: LoopAttempt = {
      id: 'attempt-1',
      attemptNumber: 1,
      executionMode: 'background-worker',
      status: 'failed',
      workdir: { mode: 'workspace-root', workspaceRoot: '/ws', cwd: '/ws' },
      parentSessionId: 'orchestrator:loop-1',
      baseRef: 'HEAD0',
      changedFiles: ['src/a.ts'],
      checkResults: [
        {
          checkId: 'command:0',
          type: 'command',
          status: 'failed',
          command: 'pnpm test',
          summary: 'AssertionError: expected 1 to equal 2',
          startedAt: 't',
          endedAt: 't',
        },
      ],
      learned: 'The fix did not address the off-by-one.',
      startedAt: 't',
    };
    const loop = makeLoop({
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
      attempts: [priorAttempt],
    });
    const { taskPrompt } = buildImplementerInstruction({ loop, priorAttempt });
    expect(taskPrompt).toMatch(/Fix the failing test/);
    expect(taskPrompt).toMatch(/pnpm test/);
    expect(taskPrompt).toMatch(/Previous attempt 1/);
    expect(taskPrompt).toMatch(/off-by-one/);
    expect(taskPrompt).toMatch(/AssertionError/);
  });
});

describe('parseWorkerOutput (D-08)', () => {
  it('parses the trailing fenced JSON block', () => {
    const text = [
      'I edited the file and ran the tests.',
      '```json',
      '{ "summary": "patched off-by-one", "outcome": "changes-made", "nextAction": "rerun" }',
      '```',
    ].join('\n');
    const parsed = parseWorkerOutput(text);
    expect(parsed).toEqual({
      summary: 'patched off-by-one',
      outcome: 'changes-made',
      nextAction: 'rerun',
      changedFiles: undefined,
    });
  });

  it('takes the LAST json block when several are present', () => {
    const text = [
      '```json',
      '{ "summary": "first", "outcome": "blocked" }',
      '```',
      'then I reconsidered',
      '```json',
      '{ "summary": "final", "outcome": "changes-made" }',
      '```',
    ].join('\n');
    expect(parseWorkerOutput(text)?.summary).toBe('final');
  });

  it('returns null on missing / malformed / schema-invalid JSON (soft fail)', () => {
    expect(parseWorkerOutput('no json here')).toBeNull();
    expect(parseWorkerOutput('```json\n{ not valid }\n```')).toBeNull();
    // Missing required `outcome`.
    expect(parseWorkerOutput('```json\n{ "summary": "x" }\n```')).toBeNull();
    // Unknown outcome value.
    expect(parseWorkerOutput('```json\n{ "summary": "x", "outcome": "nope" }\n```')).toBeNull();
  });
});
