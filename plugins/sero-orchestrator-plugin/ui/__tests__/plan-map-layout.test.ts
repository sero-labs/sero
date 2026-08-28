import { describe, expect, it } from 'vitest';
import type { LoopStepDefinition } from '../../shared/types';
import {
  clampStepsPerRow,
  computePlanMapLayout,
  DEFAULT_PLAN_MAP_STEPS_PER_ROW,
  type PlanMapStepsPerRow,
} from '../lib/plan-map-layout';

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

/** A chain of single-step stages, long enough to wrap at every setting. */
const chain = (count: number): LoopStepDefinition[] =>
  Array.from({ length: count }, (_, index) =>
    step(`s${index}`, index === 0 ? undefined : [`s${index - 1}`]));

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y;

const PER_ROW: PlanMapStepsPerRow[] = [1, 2, 3, 4];
const WIDE_PANEL = 1160;

describe('computePlanMapLayout', () => {
  const branched = [
    step('start'),
    step('left', ['start'], { when: { var: 'route', in: ['a'] } }),
    step('right', ['start'], { when: { var: 'route', in: ['b'] } }),
    step('finish', ['left', 'right']),
  ];

  it.each(PER_ROW)('keeps cells collision-free at %i per row', (stepsPerRow) => {
    const layout = computePlanMapLayout(chain(9), { stepsPerRow, width: WIDE_PANEL });
    for (const [index, cell] of layout.cells.entries()) {
      for (const other of layout.cells.slice(index + 1)) {
        expect(overlaps(cell, other), `${cell.id} overlaps ${other.id}`).toBe(false);
      }
    }
  });

  it('puts the steps of one dependency level in one stage cell', () => {
    const layout = computePlanMapLayout(branched, { stepsPerRow: 4, width: WIDE_PANEL });
    expect(layout.cells.map((cell) => cell.steps.map((entry) => entry.step.id))).toEqual([
      ['start'], ['left', 'right'], ['finish'],
    ]);
    expect(layout.cells[1]).toMatchObject({ kind: 'branch', branchVar: 'route' });
  });

  it('marks a level without guards as a parallel stage', () => {
    const parallel = [step('start'), step('a', ['start']), step('b', ['start'])];
    const layout = computePlanMapLayout(parallel, { stepsPerRow: 4, width: WIDE_PANEL });
    expect(layout.cells[1]).toMatchObject({ kind: 'parallel', branchVar: undefined });
  });

  it('does not label mixed guards and unconditional work as one branch', () => {
    const mixed = [
      step('start', undefined, { produces: ['routeA', 'routeB'] }),
      step('a', ['start'], { when: { var: 'routeA', in: ['a'] } }),
      step('b', ['start'], { when: { var: 'routeB', in: ['b'] } }),
      step('audit', ['start']),
    ];
    const layout = computePlanMapLayout(mixed, { stepsPerRow: 4, width: WIDE_PANEL });
    expect(layout.cells[1]).toMatchObject({ kind: 'mixed', branchVar: undefined });
  });

  it('fills a row left to right, then wraps to the next row', () => {
    const layout = computePlanMapLayout(chain(6), { stepsPerRow: 4, width: WIDE_PANEL });
    expect(layout.cells.map((cell) => [cell.row, cell.column])).toEqual([
      [0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1],
    ]);
    expect(layout.rows).toBe(2);
    const inRow = layout.cells.filter((cell) => cell.row === 0);
    expect(inRow.map((cell) => cell.x)).toEqual([...inRow.map((cell) => cell.x)].sort((a, b) => a - b));
    expect(layout.cells[4].y).toBeGreaterThan(layout.cells[3].y);
  });

  it('draws a wrap connector only where the row changes', () => {
    const layout = computePlanMapLayout(chain(6), { stepsPerRow: 4, width: WIDE_PANEL });
    const wraps = layout.edges.filter((edge) => edge.kind === 'wrap');
    expect(wraps).toHaveLength(1);
    expect(wraps[0]).toMatchObject({ fromStepId: 's3', toStepId: 's4' });
    expect(wraps[0].label?.text).toBe('wraps to the next row');
  });

  it('stacks stages in one column with no wrap at one step per row', () => {
    const layout = computePlanMapLayout(chain(4), { stepsPerRow: 1, width: WIDE_PANEL });
    expect(layout.wide).toBe(true);
    expect(layout.edges.filter((edge) => edge.kind === 'wrap')).toHaveLength(0);
    expect(new Set(layout.cells.map((cell) => cell.x)).size).toBe(1);
    expect(layout.cells.map((cell) => cell.y)).toEqual([...layout.cells.map((cell) => cell.y)].sort((a, b) => a - b));
  });

  it('adds a feedback edge that is separate from the flow', () => {
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
    const layout = computePlanMapLayout(steps, { stepsPerRow: 4, width: WIDE_PANEL });
    expect(layout.edges).toEqual([
      expect.objectContaining({ kind: 'flow', fromStepId: 'draft', toStepId: 'review' }),
      expect.objectContaining({ id: 'revise', kind: 'feedback', fromStepId: 'review', toStepId: 'draft' }),
    ]);
    expect(layout.edges[1].label?.text).toBe('loop back to 1');
  });

  it('reserves a left rail only when a loop back crosses rows', () => {
    const steps = [
      ...chain(5),
      step('s5', ['s4'], {
        feedback: { id: 'again', toStepId: 's1', when: { var: 'ok', in: [false] }, maxTraversalsPerRun: 2 },
      }),
    ];
    const sameRow = computePlanMapLayout(steps.slice(0, 3).concat(
      step('loop', ['s2'], { feedback: { id: 'again', toStepId: 's0', when: { var: 'ok', in: [false] }, maxTraversalsPerRun: 2 } }),
    ), { stepsPerRow: 4, width: WIDE_PANEL });
    const acrossRows = computePlanMapLayout(steps, { stepsPerRow: 4, width: WIDE_PANEL });

    expect(acrossRows.cells[0].x).toBeGreaterThan(sameRow.cells[0].x);
    expect(acrossRows.columnWidth).toBeLessThan(sameRow.columnWidth);
  });

  it('holds fewer stages in a row than asked when the panel is narrow', () => {
    const wide = computePlanMapLayout(chain(4), { stepsPerRow: 4, width: WIDE_PANEL });
    const narrow = computePlanMapLayout(chain(4), { stepsPerRow: 4, width: 620 });
    expect(wide.stepsPerRow).toBe(4);
    expect(narrow.stepsPerRow).toBeLessThan(4);
    expect(narrow.columnWidth).toBeGreaterThanOrEqual(200);
  });

  it('keeps a readable single-column canvas inside a very narrow panel', () => {
    const layout = computePlanMapLayout(chain(4), { stepsPerRow: 4, width: 320 });
    expect(layout.stepsPerRow).toBe(1);
    expect(layout.width).toBeGreaterThan(320);
    expect(layout.columnWidth).toBeGreaterThanOrEqual(560);
  });

  it('returns an empty layout for a plan with no steps', () => {
    expect(computePlanMapLayout([], { stepsPerRow: 4, width: WIDE_PANEL }).cells).toEqual([]);
  });
});

describe('clampStepsPerRow', () => {
  it('defaults when the stored value is missing or not a number', () => {
    expect(clampStepsPerRow(undefined)).toBe(DEFAULT_PLAN_MAP_STEPS_PER_ROW);
    expect(clampStepsPerRow('three')).toBe(DEFAULT_PLAN_MAP_STEPS_PER_ROW);
  });

  it('holds a stored value inside the supported range', () => {
    expect(clampStepsPerRow(0)).toBe(1);
    expect(clampStepsPerRow(9)).toBe(4);
    expect(clampStepsPerRow(2)).toBe(2);
    expect(clampStepsPerRow(2.4)).toBe(2);
  });
});
