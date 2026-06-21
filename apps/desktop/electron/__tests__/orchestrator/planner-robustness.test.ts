// Planner robustness — real model JSON output is not deterministic and not always
// in the exact shape we ask for. The parser must keep reasonable criteria rather
// than drop them (a dropped plan leaves a loop stuck in `draft`), the runner must
// retry, and it must always retain the raw reply so a failure is diagnosable.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AppRuntimeHost, AppRuntimeSubagentResult } from '@sero-ai/common';

import { buildPlannerTask, createPlannerRunner, parsePlannerOutput } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { LoopGoal } from '@plugins/sero-orchestrator-plugin/shared/types';

const fenced = (obj: unknown) => `Here is the plan.\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;

describe('parsePlannerOutput — forgiving of real model output', () => {
  it('keeps a judge criterion that omits the rubric (defaults to the description)', () => {
    const parsed = parsePlannerOutput(
      fenced({ criteria: [{ description: 'the text is red', decision: { kind: 'judge' } }] }),
    );
    expect(parsed!.criteria).toHaveLength(1);
    expect(parsed!.criteria[0]!.decision).toEqual({ kind: 'judge', rubric: 'the text is red' });
    // a judge with no evidence is given the diff to look at
    expect(parsed!.criteria[0]!.evidence).toEqual([{ kind: 'diff' }]);
  });

  it('accepts a decision given as a bare string', () => {
    const parsed = parsePlannerOutput(
      fenced({
        criteria: [
          { description: 'build passes', decision: 'exit-zero', evidence: ['pnpm build'] },
          { description: 'looks right', decision: 'judge' },
        ],
      }),
    );
    expect(parsed!.criteria[0]!.decision).toEqual({ kind: 'exit-zero' });
    expect(parsed!.criteria[0]!.evidence).toEqual([{ kind: 'run', command: 'pnpm build' }]);
    expect(parsed!.criteria[1]!.decision.kind).toBe('judge');
  });

  it('falls back to a judge when the decision is missing or unrecognized', () => {
    const parsed = parsePlannerOutput(
      fenced({ criteria: [{ description: 'make it nice' }, { description: 'odd', decision: { kind: 'weird' } }] }),
    );
    expect(parsed!.criteria).toHaveLength(2);
    expect(parsed!.criteria.every((c) => c.decision.kind === 'judge')).toBe(true);
  });

  it('still rejects a criterion with no description, and an empty plan', () => {
    expect(parsePlannerOutput(fenced({ criteria: [{ decision: { kind: 'judge' } }] }))).toBeNull();
    expect(parsePlannerOutput('no json at all')).toBeNull();
  });

  it('does not mistake an implementer-style reply (prose + code fences, no JSON) for a plan', () => {
    // The real shape that left a loop stuck in draft: for a tiny goal the model
    // described the edit to make instead of authoring a plan, emitting ```tsx code
    // fences but no JSON. It must parse to null, never a plan coerced from a stray
    // non-JSON fence (the prompt is hardened to prevent this reply; the parser must
    // never paper over it if a future model still slips).
    const reply = [
      'I found the text in `src/main.tsx`.',
      '',
      'Change:',
      '',
      '```tsx',
      '<p className="max-w-xl text-lg text-slate-300">',
      '```',
      '',
      'to:',
      '',
      '```tsx',
      '<p className="max-w-xl text-lg text-red-500">',
      '```',
      '',
      "I don't currently have a file edit tool available, so I can't apply the change.",
    ].join('\n');
    expect(parsePlannerOutput(reply)).toBeNull();
  });
});

describe('buildPlannerTask — frames the goal as someone else’s job', () => {
  // The planner runs on the base coding-agent prompt (our text is only a suffix),
  // so a command-shaped task makes the model implement instead of plan. The task
  // must put distance between the planner and the doing.
  const loop = { id: 'l', title: 'Red text', goal: 'make the heading red' } as LoopGoal;

  it('tells the planner an implementer does the goal and it only writes the plan', () => {
    const task = buildPlannerTask(loop);
    expect(task).toContain('separate implementer');
    expect(task).toContain('not perform the goal');
    expect(task).toContain('verification plan');
    // the goal text is still present for the planner to plan against
    expect(task).toContain('make the heading red');
  });
});

describe('createPlannerRunner — retry + raw-output retention', () => {
  function makeHost(replies: AppRuntimeSubagentResult[]): AppRuntimeHost {
    let i = 0;
    return {
      subagents: {
        async runStructured(): Promise<AppRuntimeSubagentResult> {
          return replies[Math.min(i++, replies.length - 1)]!;
        },
      },
    } as unknown as AppRuntimeHost;
  }

  const loop = { id: 'loop-1', title: 'Goal', goal: 'do the thing', sessionId: undefined } as LoopGoal;

  function tempState(): { stateFilePath: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'planner-'));
    return { stateFilePath: join(dir, '.sero', 'state.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it('retries past a bad reply and returns the next good plan', async () => {
    const good = fenced({ criteria: [{ description: 'ok', decision: { kind: 'exit-zero' }, evidence: ['t'] }] });
    const host = makeHost([{ response: 'no json here' }, { response: good, modelId: 'm' }]);
    const { stateFilePath, cleanup } = tempState();

    const result = await createPlannerRunner({ host, workspaceId: 'ws', cwd: '/ws', stateFilePath })(loop);
    expect(result).not.toBeNull();
    expect(result!.criteria).toHaveLength(1);
    cleanup();
  });

  it('returns null after all retries fail, and retains the raw output for diagnosis', async () => {
    const host = makeHost([{ response: 'still no json' }]);
    const { stateFilePath, cleanup } = tempState();

    const result = await createPlannerRunner({ host, workspaceId: 'ws', cwd: '/ws', stateFilePath })(loop);
    expect(result).toBeNull();

    const artifact = join(dirname(stateFilePath), 'artifacts', 'planner-loop-1', 'planner-response.txt');
    expect(existsSync(artifact)).toBe(true);
    const body = readFileSync(artifact, 'utf8');
    expect(body).toContain('no parseable plan');
    expect(body).toContain('still no json');
    cleanup();
  });
});
