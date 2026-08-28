/**
 * Serpentine plan-map geometry (styleguide prototype
 * `prototypes/plan-view-layouts/serpentine.html`).
 *
 * A stage is one dependency level: a single step, the steps that run together
 * (parallel), or the steps that compete on one guard (branch). Stages fill a row
 * left to right, then the flow wraps to the next row, the way text wraps. The
 * user sets how many stages a row holds, so a long plan stays readable at full
 * size instead of shrinking to fit.
 *
 * Connectors join consecutive stages. A stage depends only on earlier stages, so
 * the chain is a correct summary of the order; the exact `dependsOn` pairs stay
 * in the Details view.
 */

import type { LoopStepDefinition } from '../../shared/types';
import { groupStepsByLevel } from './plan-levels';

export type PlanMapStepsPerRow = 1 | 2 | 3 | 4;

export const PLAN_MAP_STEPS_PER_ROW_MIN = 1;
export const PLAN_MAP_STEPS_PER_ROW_MAX = 4;
export const DEFAULT_PLAN_MAP_STEPS_PER_ROW: PlanMapStepsPerRow = 4;

/** A stored or user-set value, held inside the supported range. */
export function clampStepsPerRow(value: unknown): PlanMapStepsPerRow {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return DEFAULT_PLAN_MAP_STEPS_PER_ROW;
  const bounded = Math.min(PLAN_MAP_STEPS_PER_ROW_MAX, Math.max(PLAN_MAP_STEPS_PER_ROW_MIN, rounded));
  return bounded as PlanMapStepsPerRow;
}

export interface PlanMapCellStep {
  step: LoopStepDefinition;
  number: number;
}

export interface PlanMapCell {
  id: string;
  kind: 'single' | 'parallel' | 'branch' | 'mixed';
  /** Routing variable the steps of a branch stage are guarded on. */
  branchVar?: string;
  steps: PlanMapCellStep[];
  stage: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Height of one step inside a parallel or branch stage. */
  stepHeight: number;
}

export interface PlanMapEdgeLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface PlanMapEdge {
  id: string;
  kind: 'flow' | 'wrap' | 'feedback';
  fromStepId: string;
  toStepId: string;
  path: string;
  label?: PlanMapEdgeLabel;
}

export interface PlanMapLayout {
  width: number;
  height: number;
  rows: number;
  /** True when a row holds one stage, and every step is a full-width row. */
  wide: boolean;
  /** Stages a row actually holds, after the panel width is applied. */
  stepsPerRow: PlanMapStepsPerRow;
  /**
   * Title lines a card reserves. A card has one fixed height, so the card must
   * clamp its title to exactly this, or a long title pushes the outcome out.
   */
  titleLines: 1 | 2;
  columnWidth: number;
  cells: PlanMapCell[];
  edges: PlanMapEdge[];
}

const PADDING_X = 20;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 18;
const COLUMN_GAP = 30;
/** Left gutter a loop back uses when its two ends sit in different rows. */
const LOOP_RAIL = 26;
/** Below this a column cannot hold a readable card, so a row holds fewer. */
const MIN_COLUMN_WIDTH = 216;
export const PLAN_MAP_MIN_WIDTH = 320;
/** A single-column card keeps a readable canvas and scrolls inside a narrower panel. */
export const PLAN_MAP_SINGLE_COLUMN_MIN_WIDTH = 640;

const ROW_GAP: Record<PlanMapStepsPerRow, number> = { 1: 18, 2: 24, 3: 26, 4: 40 };
const CARD_HEIGHT: Record<PlanMapStepsPerRow, number> = { 1: 82, 2: 82, 3: 82, 4: 100 };
const GROUPED_STEP_HEIGHT: Record<PlanMapStepsPerRow, number> = { 1: 76, 2: 76, 3: 76, 4: 76 };
/** Narrow columns need two title lines; a wide column fits a title on one. */
const TITLE_LINES: Record<PlanMapStepsPerRow, 1 | 2> = { 1: 1, 2: 1, 3: 1, 4: 2 };
const GROUP_LABEL_HEIGHT = 22;
const GROUP_PADDING = 10;
const GROUP_GAP = 6;

interface StageGroup {
  kind: PlanMapCell['kind'];
  branchVar?: string;
  steps: PlanMapCellStep[];
}

function toStages(steps: LoopStepDefinition[]): StageGroup[] {
  const numberById = new Map(steps.map((step, index) => [step.id, index + 1]));
  return groupStepsByLevel(steps).map((level) => {
    const guarded = level.filter((step) => step.when);
    const branchVars = new Set(guarded.flatMap((step) => step.when ? [step.when.var] : []));
    const oneBranch = guarded.length === level.length && branchVars.size === 1;
    let kind: PlanMapCell['kind'] = 'single';
    if (level.length > 1) {
      if (oneBranch) kind = 'branch';
      else if (guarded.length === 0) kind = 'parallel';
      else kind = 'mixed';
    }
    return {
      kind,
      branchVar: oneBranch ? guarded[0].when?.var : undefined,
      steps: level.map((step) => ({ step, number: numberById.get(step.id)! })),
    };
  });
}

/** The setting, reduced when the panel is too narrow to hold that many columns. */
function fitStepsPerRow(setting: PlanMapStepsPerRow, width: number): PlanMapStepsPerRow {
  for (let perRow = setting; perRow > 1; perRow -= 1) {
    const columns = (width - PADDING_X * 2 - COLUMN_GAP * (perRow - 1)) / perRow;
    if (columns >= MIN_COLUMN_WIDTH) return perRow as PlanMapStepsPerRow;
  }
  return 1;
}

export function computePlanMapLayout(
  steps: LoopStepDefinition[],
  options: { stepsPerRow: PlanMapStepsPerRow; width: number },
): PlanMapLayout {
  const empty: PlanMapLayout = {
    width: 0, height: 0, rows: 0, wide: false, stepsPerRow: options.stepsPerRow,
    titleLines: TITLE_LINES[options.stepsPerRow], columnWidth: 0, cells: [], edges: [],
  };
  if (steps.length === 0) return empty;

  const panelWidth = Math.max(PLAN_MAP_MIN_WIDTH, options.width);
  const stages = toStages(steps);
  const stepsPerRow = fitStepsPerRow(options.stepsPerRow, panelWidth);
  const width = stepsPerRow === 1
    ? Math.max(PLAN_MAP_SINGLE_COLUMN_MIN_WIDTH, panelWidth)
    : panelWidth;
  const rowOf = (stage: number) => Math.floor(stage / stepsPerRow);
  const rail = usesLoopRail(steps, stages, rowOf) ? LOOP_RAIL : 0;
  const left = PADDING_X + rail;
  const columnWidth = (width - PADDING_X - left - COLUMN_GAP * (stepsPerRow - 1)) / stepsPerRow;
  const stepHeight = GROUPED_STEP_HEIGHT[stepsPerRow];
  const heightOf = (count: number) => count === 1
    ? CARD_HEIGHT[stepsPerRow]
    : GROUP_LABEL_HEIGHT + count * stepHeight + (count - 1) * GROUP_GAP + GROUP_PADDING;

  const rowHeights: number[] = [];
  stages.forEach((stage, index) => {
    const row = rowOf(index);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, heightOf(stage.steps.length));
  });
  const rowTops = rowHeights.reduce<number[]>((tops, height, row) => {
    tops.push(row === 0 ? PADDING_TOP : tops[row - 1] + rowHeights[row - 1] + ROW_GAP[stepsPerRow]);
    return tops;
  }, []);

  const cells: PlanMapCell[] = stages.map((stage, index) => {
    const row = rowOf(index);
    const column = index % stepsPerRow;
    const height = heightOf(stage.steps.length);
    return {
      id: stage.steps.map((entry) => entry.step.id).join('+'),
      kind: stage.kind,
      branchVar: stage.branchVar,
      steps: stage.steps,
      stage: index,
      row,
      column,
      x: left + column * (columnWidth + COLUMN_GAP),
      y: rowTops[row] + (rowHeights[row] - height) / 2,
      width: columnWidth,
      height,
      stepHeight,
    };
  });

  const lastRow = rowHeights.length - 1;
  return {
    width,
    height: rowTops[lastRow] + rowHeights[lastRow] + PADDING_BOTTOM,
    rows: rowHeights.length,
    wide: stepsPerRow === 1,
    stepsPerRow,
    titleLines: TITLE_LINES[stepsPerRow],
    columnWidth,
    cells,
    edges: [
      ...flowEdges(cells, rowTops, width, left),
      ...feedbackEdges(cells, rowTops, rowHeights, PADDING_X + 8),
    ],
  };
}

function usesLoopRail(
  steps: LoopStepDefinition[],
  stages: StageGroup[],
  rowOf: (stage: number) => number,
): boolean {
  const stageOf = new Map<string, number>();
  stages.forEach((stage, index) => stage.steps.forEach((entry) => stageOf.set(entry.step.id, index)));
  return steps.some((step) => {
    const from = stageOf.get(step.id);
    const to = step.feedback ? stageOf.get(step.feedback.toStepId) : undefined;
    return from !== undefined && to !== undefined && rowOf(from) !== rowOf(to);
  });
}

const centreY = (cell: PlanMapCell) => cell.y + cell.height / 2;
const centreX = (cell: PlanMapCell) => cell.x + cell.width / 2;

function flowEdges(cells: PlanMapCell[], rowTops: number[], width: number, left: number): PlanMapEdge[] {
  const edges: PlanMapEdge[] = [];
  for (let index = 1; index < cells.length; index += 1) {
    const from = cells[index - 1];
    const to = cells[index];
    const id = `${from.id}->${to.id}`;
    const fromStepId = from.steps.at(-1)!.step.id;
    const toStepId = to.steps[0].step.id;

    if (from.row === to.row) {
      const [y1, y2] = [centreY(from), centreY(to)];
      const control = from.x + from.width + COLUMN_GAP / 2;
      edges.push({
        id, kind: 'flow', fromStepId, toStepId,
        path: `M ${from.x + from.width} ${y1} C ${control} ${y1}, ${control} ${y2}, ${to.x - 3} ${y2}`,
      });
      continue;
    }

    if (from.column === to.column) {
      const x = centreX(from);
      edges.push({
        id, kind: 'flow', fromStepId, toStepId,
        path: `M ${x} ${from.y + from.height} V ${to.y - 3}`,
      });
      continue;
    }

    const lane = rowTops[to.row] - 6;
    const [y1, y2] = [centreY(from), centreY(to)];
    const outX = width - 10;
    const inX = left - 12;
    edges.push({
      id, kind: 'wrap', fromStepId, toStepId,
      path: `M ${from.x + from.width} ${y1} H ${outX - 8} Q ${outX} ${y1} ${outX} ${y1 + 8}`
        + ` V ${lane - 8} Q ${outX} ${lane} ${outX - 8} ${lane}`
        + ` H ${inX + 8} Q ${inX} ${lane} ${inX} ${lane + 8}`
        + ` V ${y2 - 8} Q ${inX} ${y2} ${inX + 8} ${y2} H ${to.x - 3}`,
      label: { text: 'wraps to the next row', x: outX - 14, y: lane - 5, anchor: 'end' },
    });
  }
  return edges;
}

function feedbackEdges(
  cells: PlanMapCell[],
  rowTops: number[],
  rowHeights: number[],
  railX: number,
): PlanMapEdge[] {
  const cellOf = new Map<string, PlanMapCell>();
  for (const cell of cells) for (const entry of cell.steps) cellOf.set(entry.step.id, cell);
  const numberOf = new Map<string, number>();
  for (const cell of cells) for (const entry of cell.steps) numberOf.set(entry.step.id, entry.number);

  const edges: PlanMapEdge[] = [];
  for (const cell of cells) {
    for (const { step } of cell.steps) {
      const feedback = step.feedback;
      const target = feedback ? cellOf.get(feedback.toStepId) : undefined;
      if (!feedback || !target) continue;
      const text = `loop back to ${numberOf.get(feedback.toStepId)}`;
      const shared = { id: feedback.id, kind: 'feedback' as const, fromStepId: step.id, toStepId: feedback.toStepId };

      if (cell.row === target.row) {
        const lane = rowTops[cell.row] + rowHeights[cell.row] + 14;
        const [x1, x2] = [centreX(cell), centreX(target)];
        edges.push({
          ...shared,
          path: `M ${x1} ${cell.y + cell.height} C ${x1} ${lane}, ${x2} ${lane}, ${x2} ${target.y + target.height + 3}`,
          label: { text, x: (x1 + x2) / 2, y: lane + 12, anchor: 'middle' },
        });
        continue;
      }

      const entryX = target.x + 26;
      const returnY = target.y + target.height + 12;
      edges.push({
        ...shared,
        path: `M ${cell.x - 3} ${centreY(cell)} H ${railX + 8} Q ${railX} ${centreY(cell)} ${railX} ${centreY(cell) - 8}`
          + ` V ${returnY + 8} Q ${railX} ${returnY} ${railX + 8} ${returnY}`
          + ` H ${entryX - 8} Q ${entryX} ${returnY} ${entryX} ${returnY - 8}`
          + ` V ${target.y + target.height + 3}`,
        label: { text, x: entryX + 8, y: returnY + 4, anchor: 'start' },
      });
    }
  }
  return edges;
}
