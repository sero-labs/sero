// P-B — criterion-judge (spec 05 §6.3). A judge criterion gathers its evidence
// (run/read/diff/gitLog) at the attempt cwd, then a read-only judge subagent
// rules pass/fail. The judge is the same `runStructured` seam the implementer
// uses; tests branch the worker script on the judge's system prompt and inject a
// deterministic verdict. Validates the changelog (pure judge) and dead-code
// (mixed mechanical + judge) example shapes from spec 05 §9.

import { describe, expect, it } from 'vitest';

import { createHarness, settle, type WorkerScript } from './harness';
import { parseVerdict } from '@plugins/sero-orchestrator-plugin/runtime/judge';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { EvidenceStep, SuccessCriterion } from '@plugins/sero-orchestrator-plugin/shared/types';

const verdict = (v: 'pass' | 'fail', summary = v) =>
  `\`\`\`json\n{"verdict":"${v}","summary":"${summary}"}\n\`\`\``;

const isJudge = (systemPrompt: string | undefined) => Boolean(systemPrompt?.includes('verification judge'));

function planWith(criteria: SuccessCriterion[]): PlannerRunner {
  return async () => ({ criteria, stopConditions: [] });
}

function judgeCriterion(evidence: EvidenceStep[], required = true): SuccessCriterion {
  return { id: 'judged', description: 'is it right?', evidence, decision: { kind: 'judge', rubric: 'is it right' }, required };
}

/** Worker that implements then answers the judge with a fixed verdict; captures judge tasks. */
function workerWithJudge(judgeVerdict: 'pass' | 'fail', sink?: { tasks: string[] }): WorkerScript {
  return (params) => {
    if (isJudge(params.systemPrompt)) {
      sink?.tasks.push(params.task);
      return { response: verdict(judgeVerdict) };
    }
    return { response: 'implemented', changedFiles: ['x.ts'], diff: 'DIFFBODY' };
  };
}

describe('P-B — criterion-judge', () => {
  it('completes when the judge passes a required criterion', async () => {
    const h = createHarness({
      planner: planWith([judgeCriterion([{ kind: 'diff' }])]),
      runWorker: workerWithJudge('pass'),
    });
    const id = await h.createLoop();
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).toBe('complete');
    const result = loop!.attempts.at(-1)!.checkResults[0]!;
    expect(result.type).toBe('criterion');
    expect(result.decisionKind).toBe('judge');
    expect(result.status).toBe('passed');
    h.cleanup();
  });

  it('does not complete when the judge fails a required criterion', async () => {
    const h = createHarness({
      planner: planWith([judgeCriterion([{ kind: 'diff' }])]),
      runWorker: workerWithJudge('fail'),
    });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).toBe('stopped');
    expect(loop!.attempts.at(-1)!.checkResults[0]!.status).toBe('failed');
    h.cleanup();
  });

  it('fails safe when the judge returns no parseable verdict', async () => {
    const noVerdict: WorkerScript = (params) =>
      isJudge(params.systemPrompt)
        ? { response: 'I am not sure.' }
        : { response: 'implemented', changedFiles: ['x.ts'] };
    const h = createHarness({ planner: planWith([judgeCriterion([{ kind: 'diff' }])]), runWorker: noVerdict });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect((await h.loop(id))!.attempts.at(-1)!.checkResults[0]!.status).toBe('failed');
    h.cleanup();
  });

  it('completes when the judge replies with bare JSON (no fence) — the live failure shape', async () => {
    // Live, the judge ruled correctly but emitted bare JSON with no ```json fence,
    // so the old strict parser returned "no verdict" and the change was marked
    // failed even though it was right. A bare-JSON pass must now complete.
    const bareJsonJudge: WorkerScript = (params) =>
      isJudge(params.systemPrompt)
        ? { response: '{"verdict": "pass", "summary": "text is blue"}' }
        : { response: 'implemented', changedFiles: ['x.ts'], diff: 'slate->blue' };
    const h = createHarness({
      planner: planWith([judgeCriterion([{ kind: 'diff' }])]),
      runWorker: bareJsonJudge,
    });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect((await h.loop(id))!.status).toBe('complete');
    h.cleanup();
  });

  it('feeds the gathered diff into the judge', async () => {
    const sink = { tasks: [] as string[] };
    const h = createHarness({
      planner: planWith([judgeCriterion([{ kind: 'diff' }])]),
      runWorker: workerWithJudge('pass', sink),
    });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });

    expect(sink.tasks).toHaveLength(1);
    expect(sink.tasks[0]).toContain('DIFFBODY'); // the worker's diff reached the judge
    // The diff is taken via `git diff <baseRef>` (captures the worker's UNCOMMITTED
    // change) — NOT host.git.getDiff, which would be empty for it at the root.
    expect(h.commands.some((c) => c.startsWith('git diff '))).toBe(true);
    h.cleanup();
  });

  it('gathers gitLog + read evidence (changelog shape) and passes it to the judge', async () => {
    const sink = { tasks: [] as string[] };
    const h = createHarness({
      planner: planWith([
        judgeCriterion([
          { kind: 'gitLog', since: 'yesterday' },
          { kind: 'read', path: 'CHANGELOG.md' },
          { kind: 'diff' },
        ]),
      ]),
      runWorker: workerWithJudge('pass', sink),
      gitLog: 'abc123 fix the thing',
      files: { 'CHANGELOG.md': '## Unreleased\n- fixed the thing' },
    });
    const id = await h.createLoop({ goal: 'keep the changelog current' });
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });

    const task = sink.tasks[0]!;
    expect(task).toContain('abc123 fix the thing'); // gitLog evidence
    expect(task).toContain('fixed the thing'); // read CHANGELOG evidence
    expect(h.commands).toContain('git log --oneline --since="yesterday"');
    expect(h.commands).toContain('cat -- "CHANGELOG.md"');
    expect((await h.loop(id))!.status).toBe('complete');
    h.cleanup();
  });

  describe('parseVerdict — tolerant of real model output', () => {
    it('reads a bare-JSON verdict and verdict/passed synonyms', () => {
      expect(parseVerdict('{"verdict":"pass","summary":"ok"}')).toEqual({ verdict: 'pass', summary: 'ok' });
      expect(parseVerdict('here:\n{"verdict":"PASSED"}')!.verdict).toBe('pass');
      expect(parseVerdict('{"verdict":"Failed"}')!.verdict).toBe('fail');
      expect(parseVerdict('{"passed": true}')!.verdict).toBe('pass');
      expect(parseVerdict('{"passed": false, "reason": "nope"}')).toEqual({ verdict: 'fail', summary: 'nope' });
      expect(parseVerdict('```json\n{"verdict":"pass"}\n```')!.verdict).toBe('pass');
    });

    it('returns null for a genuine no-verdict reply', () => {
      expect(parseVerdict('I am not sure either way.')).toBeNull();
      expect(parseVerdict('{"note": "thinking about it"}')).toBeNull();
    });
  });

  it('dead-code shape: a mechanical exit-zero AND a judge criterion both gate completion', async () => {
    const criteria: SuccessCriterion[] = [
      { id: 'build', description: 'build passes', evidence: [{ kind: 'run', command: 'pnpm build' }], decision: { kind: 'exit-zero' }, required: true },
      judgeCriterion([{ kind: 'diff' }]),
    ];

    // Build passes but the judge says the removal is NOT safe → not complete.
    const failJudge = createHarness({
      planner: planWith(criteria),
      runWorker: workerWithJudge('fail'),
      verify: (command) => ({ command, success: true, stdout: '', stderr: '', durationMs: 1 }),
    });
    const failId = await failJudge.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();
    await failJudge.coordinator.requestAction({ kind: 'run_next', loopId: failId });
    const failed = await failJudge.loop(failId);
    expect(failed!.status).not.toBe('complete');
    expect(failed!.attempts.at(-1)!.checkResults.map((r) => r.status)).toEqual(['passed', 'failed']);
    failJudge.cleanup();

    // Build passes and the judge approves → complete.
    const passJudge = createHarness({
      planner: planWith(criteria),
      runWorker: workerWithJudge('pass'),
      verify: (command) => ({ command, success: true, stdout: '', stderr: '', durationMs: 1 }),
    });
    const passId = await passJudge.createLoop();
    await settle();
    await passJudge.coordinator.requestAction({ kind: 'run_next', loopId: passId });
    expect((await passJudge.loop(passId))!.status).toBe('complete');
    passJudge.cleanup();
  });
});
