/**
 * The judge decides when a run is finished, so the tests are about the ways a
 * check like this has previously reported success it had not earned: a boolean
 * one big feature can win, a verdict from a run that never looked, and an
 * unreachable judge quietly counting as a pass.
 */
import { describe, expect, it } from 'vitest';
import {
  JUDGE_ASPECTS,
  MAX_SCORE,
  PASS_TOTAL,
  createComparisonTool,
  createVerdictTool,
} from './judge';

const images = { target: Buffer.from('t'), render: Buffer.from('r'), parts: null };

async function score(values: Record<string, number>) {
  const tool = createVerdictTool();
  await tool.definition.execute?.('call', { seen: 'a grey figure', missing: 'the head', ...values }, {} as never, {} as never, {} as never);
  return tool.verdict();
}

describe('scoring', () => {
  it('a strong showing on one aspect cannot carry the rest', () => {
    // The failure a boolean invites: a red plume on a grey lump answering yes
    // to "same character?".
    return score({ silhouette: 0, proportions: 0, head: 0, equipment: 3, colour: 3 }).then((verdict) => {
      expect(verdict?.total).toBe(6);
      expect(verdict?.passed).toBe(false);
    });
  });

  it('nothing may be missing outright, however good the total', async () => {
    // 10 of 15 clears the bar on points, but a character with no head is not
    // a character, so a zero on any aspect fails regardless.
    const verdict = await score({ silhouette: 3, proportions: 3, head: 0, equipment: 2, colour: 2 });
    expect(verdict?.total).toBe(PASS_TOTAL);
    expect(verdict?.passed).toBe(false);
  });

  it('passes a render that is a little wrong everywhere but missing nothing', async () => {
    const verdict = await score({ silhouette: 2, proportions: 2, head: 2, equipment: 2, colour: 2 });
    expect(verdict?.total).toBe(10);
    expect(verdict?.passed).toBe(true);
  });

  it('the bar is reachable but not free', () => {
    // Every aspect merely 'attempted' is what the blind runs already produced;
    // it must not pass.
    const attempted = JUDGE_ASPECTS.length * 1;
    expect(attempted).toBeLessThan(PASS_TOTAL);
    expect(PASS_TOTAL).toBeLessThan(JUDGE_ASPECTS.length * MAX_SCORE);
  });
});

describe('looking', () => {
  it('records that the pictures were shown, and shows both', async () => {
    const tool = createComparisonTool(images);
    expect(tool.looked()).toBe(false);
    const result = await tool.definition.execute?.('call', {}, {} as never, {} as never, {} as never);
    expect(tool.looked()).toBe(true);
    const pictures = (result?.content ?? []).filter((entry) => entry.type === 'image');
    expect(pictures).toHaveLength(2);
  });

  it('includes the parts sheet only when there is one', async () => {
    const withParts = createComparisonTool({ ...images, parts: Buffer.from('p') });
    const result = await withParts.definition.execute?.('call', {}, {} as never, {} as never, {} as never);
    expect((result?.content ?? []).filter((entry) => entry.type === 'image')).toHaveLength(3);
  });
});
