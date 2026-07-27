import type { LoopStepDefinition } from '../../shared/types';
import { groupStepsByLevel } from './plan-levels';

export type PlanMapOrientation = 'horizontal' | 'vertical';

export interface PlanMapNode {
  step: LoopStepDefinition;
  number: number;
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanMapEdge {
  id: string;
  fromStepId: string;
  toStepId: string;
  path: string;
  feedback: boolean;
}

export interface PlanMapLayout {
  width: number;
  height: number;
  nodes: PlanMapNode[];
  edges: PlanMapEdge[];
}

export const PLAN_MAP_NODE_WIDTH = 176;
export const PLAN_MAP_NODE_HEIGHT = 64;

const LEVEL_GAP = 72;
const LANE_GAP = 18;
const PADDING = 32;
const FEEDBACK_GUTTER = 30;

export function computePlanMapLayout(
  steps: LoopStepDefinition[],
  orientation: PlanMapOrientation,
): PlanMapLayout {
  if (steps.length === 0) return { width: 0, height: 0, nodes: [], edges: [] };

  const levels = groupStepsByLevel(steps);
  const maxLaneCount = Math.max(...levels.map((level) => level.length));
  const hasFeedback = steps.some((step) => step.feedback);
  const outerPadding = PADDING + (hasFeedback ? FEEDBACK_GUTTER : 0);

  const horizontal = orientation === 'horizontal';
  const contentWidth = horizontal
    ? levels.length * PLAN_MAP_NODE_WIDTH + (levels.length - 1) * LEVEL_GAP
    : maxLaneCount * PLAN_MAP_NODE_WIDTH + (maxLaneCount - 1) * LANE_GAP;
  const contentHeight = horizontal
    ? maxLaneCount * PLAN_MAP_NODE_HEIGHT + (maxLaneCount - 1) * LANE_GAP
    : levels.length * PLAN_MAP_NODE_HEIGHT + (levels.length - 1) * LEVEL_GAP;
  const width = contentWidth + outerPadding * 2;
  const height = contentHeight + outerPadding * 2;
  const numberById = new Map(steps.map((step, index) => [step.id, index + 1]));

  const nodes = levels.flatMap((levelSteps, level) => {
    const laneSpan = horizontal
      ? levelSteps.length * PLAN_MAP_NODE_HEIGHT + (levelSteps.length - 1) * LANE_GAP
      : levelSteps.length * PLAN_MAP_NODE_WIDTH + (levelSteps.length - 1) * LANE_GAP;
    const laneOffset = (horizontal ? contentHeight - laneSpan : contentWidth - laneSpan) / 2;

    return levelSteps.map((step, lane) => ({
      step,
      number: numberById.get(step.id)!,
      level,
      x: horizontal
        ? outerPadding + level * (PLAN_MAP_NODE_WIDTH + LEVEL_GAP)
        : outerPadding + laneOffset + lane * (PLAN_MAP_NODE_WIDTH + LANE_GAP),
      y: horizontal
        ? outerPadding + laneOffset + lane * (PLAN_MAP_NODE_HEIGHT + LANE_GAP)
        : outerPadding + level * (PLAN_MAP_NODE_HEIGHT + LEVEL_GAP),
      width: PLAN_MAP_NODE_WIDTH,
      height: PLAN_MAP_NODE_HEIGHT,
    }));
  });

  const byId = new Map(nodes.map((node) => [node.step.id, node]));
  const edges: PlanMapEdge[] = [];

  for (const target of nodes) {
    for (const dependencyId of target.step.dependsOn ?? []) {
      const source = byId.get(dependencyId);
      if (!source) continue;
      edges.push({
        id: `${dependencyId}->${target.step.id}`,
        fromStepId: dependencyId,
        toStepId: target.step.id,
        path: forwardPath(source, target, orientation),
        feedback: false,
      });
    }

    const feedback = target.step.feedback;
    const feedbackTarget = feedback ? byId.get(feedback.toStepId) : undefined;
    if (feedback && feedbackTarget) {
      edges.push({
        id: feedback.id,
        fromStepId: target.step.id,
        toStepId: feedbackTarget.step.id,
        path: feedbackPath(target, feedbackTarget, orientation, width, height),
        feedback: true,
      });
    }
  }

  return { width, height, nodes, edges };
}

function forwardPath(
  source: PlanMapNode,
  target: PlanMapNode,
  orientation: PlanMapOrientation,
): string {
  if (orientation === 'horizontal') {
    const fromX = source.x + source.width;
    const fromY = source.y + source.height / 2;
    const toX = target.x;
    const toY = target.y + target.height / 2;
    const controlX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;
  }

  const fromX = source.x + source.width / 2;
  const fromY = source.y + source.height;
  const toX = target.x + target.width / 2;
  const toY = target.y;
  const controlY = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} ${toY}`;
}

function feedbackPath(
  source: PlanMapNode,
  target: PlanMapNode,
  orientation: PlanMapOrientation,
  width: number,
  height: number,
): string {
  if (orientation === 'horizontal') {
    const fromX = source.x + source.width / 2;
    const fromY = source.y + source.height;
    const toX = target.x + target.width / 2;
    const toY = target.y + target.height;
    const outerY = height - PADDING / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${outerY}, ${toX} ${outerY}, ${toX} ${toY}`;
  }

  const fromX = source.x + source.width;
  const fromY = source.y + source.height / 2;
  const toX = target.x + target.width;
  const toY = target.y + target.height / 2;
  const outerX = width - PADDING / 2;
  return `M ${fromX} ${fromY} C ${outerX} ${fromY}, ${outerX} ${toY}, ${toX} ${toY}`;
}
