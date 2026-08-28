import { useCallback, useId, useMemo, useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Card } from '@sero-ai/ui/components/ui/card';
import { Bot, Check, MessageSquare, Sparkles, Users } from 'lucide-react';
import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import {
  computePlanMapLayout,
  type PlanMapCell,
  type PlanMapEdge,
  type PlanMapStepsPerRow,
} from '../lib/plan-map-layout';
import { mapEdgeState } from '../lib/plan-map-state';
import { guardLabel } from '../lib/guard-label';
import { STEP_STATUS_STYLE } from '../lib/status-style';
import { PlanMapCard, PlanMapStageFrame } from './PlanMapCard';

interface PlanMapProps {
  loop: Loop;
  /** How many stages a row holds. The panel width can reduce it.  */
  stepsPerRow: PlanMapStepsPerRow;
}

const EDGE_STATUS_CLASS: Record<StepStatus, string> = {
  pending: 'text-border',
  ready: 'text-emerald-500/45',
  running: 'text-emerald-400',
  succeeded: 'text-emerald-500/65',
  failed: 'text-rose-500/70',
  blocked: 'text-amber-500/70',
  skipped: 'text-border/45',
  'needs-revision': 'text-amber-500/70',
};

function observeContainerWidth(container: HTMLDivElement, onWidthChange: (width: number) => void) {
  const updateWidth = () => onWidthChange(container.clientWidth);
  updateWidth();
  const observer = new ResizeObserver(updateWidth);
  observer.observe(container);
  return () => observer.disconnect();
}

export function PlanMap({ loop, stepsPerRow }: PlanMapProps) {
  const markerPrefix = useId().replaceAll(':', '');
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();

  const setContainerRef = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    return observeContainerWidth(container, setContainerWidth);
  }, []);

  const layout = useMemo(
    () => computePlanMapLayout(loop.plan.steps, { stepsPerRow, width: containerWidth }),
    [loop.plan.steps, stepsPerRow, containerWidth],
  );
  const selected = loop.plan.steps.find((step) => step.id === selectedId);
  const toggle = (stepId: string) =>
    setSelectedId((current) => (current === stepId ? undefined : stepId));

  if (loop.plan.steps.length === 0) {
    return (
      <Card className="p-3 text-base text-muted-foreground">
        No plan generated yet. Creating a Workflow asks the model to write the steps for your prompt.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 bg-background/30">
      <div
        ref={setContainerRef}
        className="max-h-[560px] min-h-52 overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
            <defs>
              {['arrow', 'feedback-arrow'].map((name) => (
                <marker key={name} id={`${markerPrefix}-${name}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" />
                </marker>
              ))}
            </defs>
            {layout.edges.map((edge) => (
              <MapEdge key={`${edge.kind}:${edge.id}`} edge={edge} loop={loop} markerPrefix={markerPrefix} />
            ))}
          </svg>

          {layout.cells.map((cell) => (
            <MapCell
              key={cell.id}
              cell={cell}
              loop={loop}
              wide={layout.wide}
              titleLines={layout.titleLines}
              selectedId={selectedId}
              onSelect={toggle}
            />
          ))}
          <ul className="sr-only" aria-label="Plan connections">
            {layout.edges.map((edge) => edge.label
              ? <li key={`${edge.kind}:${edge.id}`}>{mapEdgeLabel(edge, loop)}</li>
              : null)}
          </ul>
        </div>
      </div>

      {selected && <SelectedStep loop={loop} step={selected} />}
    </Card>
  );
}

interface MapCellProps {
  cell: PlanMapCell;
  loop: Loop;
  wide: boolean;
  titleLines: 1 | 2;
  selectedId?: string;
  onSelect: (stepId: string) => void;
}

function MapCell({ cell, loop, wide, titleLines, selectedId, onSelect }: MapCellProps) {
  const frame = { left: cell.x, top: cell.y, width: cell.width, height: cell.height };
  if (cell.kind === 'single') {
    const { step, number } = cell.steps[0];
    return (
      <PlanMapCard
        loop={loop}
        step={step}
        number={number}
        titleLines={titleLines}
        selected={selectedId === step.id}
        onSelect={() => onSelect(step.id)}
        style={frame}
      />
    );
  }

  return (
    <PlanMapStageFrame
      kind={cell.kind}
      branchVar={cell.branchVar}
      loop={loop}
      steps={cell.steps.length}
      wide={wide}
      style={frame}
    >
      {cell.steps.map(({ step, number }) => (
        <PlanMapCard
          key={step.id}
          loop={loop}
          step={step}
          number={number}
          grouped
          titleLines={titleLines}
          selected={selectedId === step.id}
          onSelect={() => onSelect(step.id)}
          style={{ height: cell.stepHeight }}
        />
      ))}
    </PlanMapStageFrame>
  );
}

function MapEdge({ edge, loop, markerPrefix }: { edge: PlanMapEdge; loop: Loop; markerPrefix: string }) {
  const feedback = edge.kind === 'feedback';
  const traversals = loop.runtime.feedbackStates?.[edge.id]?.traversals ?? 0;
  const statusClass = feedback
    ? traversals > 0 ? 'text-violet-400' : 'text-violet-500/55'
    : edge.kind === 'wrap' ? 'text-border' : EDGE_STATUS_CLASS[mapEdgeState(loop, edge.fromStepId, edge.toStepId)];
  const label = mapEdgeLabel(edge, loop);

  return (
    <g className={`transition-colors ${statusClass}`}>
      <path
        d={edge.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={feedback ? 1.75 : edge.kind === 'wrap' ? 1.25 : 1.5}
        strokeDasharray={feedback ? '5 4' : edge.kind === 'wrap' ? '3 4' : undefined}
        opacity={edge.kind === 'wrap' ? 0.65 : 1}
        markerEnd={`url(#${markerPrefix}-${feedback ? 'feedback-arrow' : 'arrow'})`}
      />
      {edge.label && label && (
        <text
          x={edge.label.x}
          y={edge.label.y}
          textAnchor={edge.label.anchor}
          fill="currentColor"
          className={`text-[10px] ${feedback ? '' : 'opacity-80'}`}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function mapEdgeLabel(edge: PlanMapEdge, loop: Loop): string | undefined {
  if (!edge.label) return undefined;
  if (edge.kind !== 'feedback') return edge.label.text;
  const traversals = loop.runtime.feedbackStates?.[edge.id]?.traversals ?? 0;
  const maxTraversals = loop.plan.steps
    .find((step) => step.feedback?.id === edge.id)?.feedback?.maxTraversalsPerRun;
  return maxTraversals === undefined
    ? edge.label.text
    : `${edge.label.text} · ${traversals} of ${maxTraversals} used`;
}

function SelectedStep({ loop, step }: { loop: Loop; step: LoopStepDefinition }) {
  const state = loop.runtime.stepStates[step.id];
  const executionIcon = step.execution.type === 'background-agent'
    ? <Bot className="h-3.5 w-3.5" />
    : step.execution.type === 'active-session'
      ? <MessageSquare className="h-3.5 w-3.5" />
      : <Sparkles className="h-3.5 w-3.5" />;

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-border/70 px-3 py-2.5 text-xs">
      <div className="flex min-w-40 items-center gap-2 font-medium">
        {state?.status === 'succeeded' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : executionIcon}
        {step.title}
      </div>
      <p className="min-w-0 flex-1 text-foreground/70">{step.instructions}</p>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-xs font-normal">{step.execution.type}</Badge>
        {state && <Badge variant="outline" className="text-xs font-normal">{STEP_STATUS_STYLE[state.status].label}</Badge>}
        {step.when && <Badge variant="outline" className="text-xs font-normal">{guardLabel(step.when)}</Badge>}
        {step.fanOut && <Badge variant="outline" className="text-xs font-normal"><Users className="mr-1 h-3 w-3" /> up to {step.fanOut.maxItems}</Badge>}
      </div>
    </div>
  );
}

export function PlanMapSkeleton() {
  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-4 flex items-center gap-2 text-base text-muted-foreground">
        <Sparkles className="h-4 w-4 animate-pulse text-sky-400" />
        The AI is shaping the plan…
      </div>
      <div className="flex min-h-40 flex-wrap items-center justify-center gap-5">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-5">
            {index > 0 && <span className="h-px w-6 bg-border" />}
            <div className="h-16 w-36 animate-pulse rounded-md border border-border bg-muted/35" />
          </div>
        ))}
      </div>
    </Card>
  );
}
