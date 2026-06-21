import { describe, expect, it } from 'vitest';
import { artifactPath, pruneRuns, storeOutput } from '../artifacts';
import type { LogPolicy, LoopRun } from '../../shared/types';
import { createFakeHost } from './fake-host';

const policy: LogPolicy = { retainRuns: 3, retainArtifacts: true, maxInlineOutputBytes: 16 };

function run(id: string): LoopRun {
  return { id, runNumber: 0, status: 'completed', startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't' };
}

describe('storeOutput', () => {
  it('keeps small output inline without an artifact', async () => {
    const host = createFakeHost();
    const result = await storeOutput(host, policy, artifactPath('r1', 'out.txt'), 'tiny');
    expect(result.inline).toBe('tiny');
    expect(result.artifactRef).toBeUndefined();
    expect(host.artifacts.size).toBe(0);
  });

  it('writes an artifact and truncates inline when over budget', async () => {
    const host = createFakeHost();
    const big = 'y'.repeat(1000);
    const result = await storeOutput(host, policy, artifactPath('r1', 'out.txt'), big);
    expect(result.artifactRef).toBeTruthy();
    expect(result.inline.length).toBeLessThan(big.length);
    expect(await host.readArtifact(result.artifactRef!)).toBe(big);
  });

  it('honours retainArtifacts=false (truncate but do not persist)', async () => {
    const host = createFakeHost();
    const result = await storeOutput(host, { ...policy, retainArtifacts: false }, artifactPath('r1', 'o'), 'z'.repeat(100));
    expect(result.artifactRef).toBeUndefined();
    expect(host.artifacts.size).toBe(0);
  });
});

describe('pruneRuns', () => {
  it('keeps only the most recent N runs', () => {
    const runs = [run('1'), run('2'), run('3'), run('4'), run('5')];
    expect(pruneRuns(runs, 3).map((r) => r.id)).toEqual(['3', '4', '5']);
  });
  it('returns all runs when under the limit', () => {
    const runs = [run('1'), run('2')];
    expect(pruneRuns(runs, 3)).toHaveLength(2);
  });
});
