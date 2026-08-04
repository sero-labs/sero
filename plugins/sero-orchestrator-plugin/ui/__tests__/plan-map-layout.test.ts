import { describe, expect, it } from 'vitest';
import type { LoopStepDefinition } from '../../shared/types';
import { computePlanMapLayout } from '../lib/plan-map-layout';

const step = (
  id: string,
  dependsOn?: string[],
  extra: Partial<LoopStepDefinition> = {},
): LoopStepDefinition => ({
  id,
  title: id,
  instructions: id,
  dependsOn,
  execution: { type: 'background-agent' },
  ...extra,
});

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y;

describe('computePlanMapLayout', () => {
  const branched = [
    step('start'),
    step('left', ['start']),
    step('right', ['start']),
    step('finish', ['left', 'right']),
  ];

  it.each(['horizontal', 'vertical'] as const)('keeps nodes collision-free in %s layout', (orientation) => {
    const layout = computePlanMapLayout(branched, orientation);
    for (const [index, node] of layout.nodes.entries()) {
      for (const other of layout.nodes.slice(index + 1)) {
        expect(overlaps(node, other), `${node.step.id} overlaps ${other.step.id}`).toBe(false);
      }
    }
  });

  it('lays dependency levels left to right in horizontal mode', () => {
    const layout = computePlanMapLayout(branched, 'horizontal');
    const byId = new Map(layout.nodes.map((node) => [node.step.id, node]));
    expect(byId.get('start')!.x).toBeLessThan(byId.get('left')!.x);
    expect(byId.get('left')!.x).toBeLessThan(byId.get('finish')!.x);
  });

  it('lays dependency levels top to bottom in vertical mode', () => {
    const layout = computePlanMapLayout(branched, 'vertical');
    const byId = new Map(layout.nodes.map((node) => [node.step.id, node]));
    expect(byId.get('start')!.y).toBeLessThan(byId.get('left')!.y);
    expect(byId.get('left')!.y).toBeLessThan(byId.get('finish')!.y);
  });

  it('includes every dependency and a distinct feedback edge', () => {
    const steps = [
      step('draft'),
      step('review', ['draft'], {
        feedback: {
          id: 'revise',
          toStepId: 'draft',
          when: { var: 'approved', in: [false] },
          maxTraversalsPerRun: 2,
        },
      }),
    ];
    const layout = computePlanMapLayout(steps, 'horizontal');
    expect(layout.edges).toEqual([
      expect.objectContaining({ fromStepId: 'draft', toStepId: 'review', feedback: false }),
      expect.objectContaining({ id: 'revise', fromStepId: 'review', toStepId: 'draft', feedback: true }),
    ]);
  });
});
