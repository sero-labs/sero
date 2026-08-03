import { useCallback, useId, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@sero-ai/ui';
import {
  Bot,
  Check,
  Circle,
  GitBranch,
  Maximize2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import {
  computePlanMapLayout,
  type PlanMapEdge,
  type PlanMapOrientation,
} from '../lib/plan-map-layout';
import { mapEdgeState, mapRouteState } from '../lib/plan-map-state';
import { STEP_STATUS_STYLE } from '../lib/status-style';
import { guardLabel } from './StepCard';

export type PlanMapOrientationSetting = PlanMapOrientation | 'auto';

interface PlanMapProps {
  loop: Loop;
  orientation: PlanMapOrientationSetting;
}

const NODE_STATUS_CLASS: Record<StepStatus, string> = {
  pending: 'border-border bg-card',
  ready: 'border-emerald-500/40 bg-emerald-500/[0.04]',
  running: 'border-emerald-400/70 bg-emerald-500/[0.08] shadow-[0_0_18px_rgba(52,211,153,0.12)]',
  succeeded: 'border-emerald-500/35 bg-emerald-500/[0.04]',
  failed: 'border-rose-500/55 bg-rose-500/[0.07]',
  blocked: 'border-amber-500/55 bg-amber-500/[0.07]',
  skipped: 'border-border/70 bg-card opacity-45',
  'needs-revision': 'border-amber-500/55 bg-amber-500/[0.07]',
};

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

const MIN_ZOOM_MULTIPLIER = 0.7;
const MAX_SCALE = 1.9;
const ZOOM_STEP = 0.15;

function observeContainerWidth(container: HTMLDivElement, onWidthChange: (width: number) => void) {
  const updateWidth = () => onWidthChange(container.clientWidth);
  updateWidth();
  const observer = new ResizeObserver(updateWidth);
  observer.observe(container);
  return () => observer.disconnect();
}

export function PlanMap({ loop, orientation }: PlanMapProps) {
  const markerPrefix = useId().replaceAll(':', '');
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();

  const setContainerRef = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    return observeContainerWidth(container, setContainerWidth);
  }, []);

  const resolvedOrientation: PlanMapOrientation =
    orientation === 'auto'
      ? containerWidth > 0 && containerWidth < 760 ? 'vertical' : 'horizontal'
      : orientation;
  const layout = useMemo(
    () => computePlanMapLayout(loop.plan.steps, resolvedOrientation),
    [loop.plan.steps, resolvedOrientation],
  );
  const fit = containerWidth > 0 ? Math.min(1, Math.max(0.25, (containerWidth - 2) / layout.width)) : 1;
  const minimumScale = fit * MIN_ZOOM_MULTIPLIER;
  const scale = Math.min(MAX_SCALE, Math.max(minimumScale, fit * zoom));
  const setScale = (nextScale: number) => {
    setZoom(Math.min(MAX_SCALE, Math.max(minimumScale, nextScale)) / fit);
  };
  const selected = loop.plan.steps.find((step) => step.id === selectedId);

  if (loop.plan.steps.length === 0) {
    return (
      <Card className="p-3 text-base text-muted-foreground">
        No plan generated yet. Creating a loop asks the model to author the steps for your prompt.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 bg-background/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-2 py-1.5">
        <span className="px-1 text-xs text-muted-foreground">
          {resolvedOrientation === 'horizontal' ? 'Left to right' : 'Top to bottom'}
          {orientation === 'auto' && ' · Auto'}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={scale <= minimumScale}
            onClick={() => setScale(scale - ZOOM_STEP)}
          >
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={scale >= MAX_SCALE}
            onClick={() => setScale(scale + ZOOM_STEP)}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Fit map"
            title="Fit map"
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            <Maximize2 />
          </Button>
        </div>
      </div>

      <div ref={setContainerRef} className="max-h-[560px] min-h-52 overflow-auto [scrollbar-gutter:stable]">
        <div style={{ width: layout.width * scale, height: layout.height * scale }}>
          <div
            className="relative origin-top-left"
            style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
          >
            <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
              <defs>
                <marker id={`${markerPrefix}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" />
                </marker>
                <marker id={`${markerPrefix}-feedback-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" />
                </marker>
              </defs>
              {layout.edges.map((edge) => (
                <MapEdge key={`${edge.feedback ? 'feedback' : 'dependency'}:${edge.id}`} edge={edge} loop={loop} markerPrefix={markerPrefix} />
              ))}
            </svg>

            {layout.nodes.map((node) => (
              <MapNode
                key={node.step.id}
                loop={loop}
                step={node.step}
                number={node.number}
                selected={selectedId === node.step.id}
                onSelect={() => setSelectedId((current) => current === node.step.id ? undefined : node.step.id)}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
              />
            ))}
          </div>
        </div>
      </div>

      {selected && <SelectedStep loop={loop} step={selected} />}
    </Card>
  );
}

function MapEdge({ edge, loop, markerPrefix }: { edge: PlanMapEdge; loop: Loop; markerPrefix: string }) {
  const status = mapEdgeState(loop, edge.fromStepId, edge.toStepId);
  const traversals = edge.feedback ? loop.runtime.feedbackStates?.[edge.id]?.traversals ?? 0 : 0;
  const statusClass = edge.feedback
    ? traversals > 0 ? 'text-violet-400' : 'text-violet-500/55'
    : EDGE_STATUS_CLASS[status];

  return (
    <path
      d={edge.path}
      fill="none"
      stroke="currentColor"
      strokeWidth={edge.feedback ? 1.75 : 1.5}
      strokeDasharray={edge.feedback ? '5 4' : undefined}
      markerEnd={`url(#${markerPrefix}-${edge.feedback ? 'feedback-arrow' : 'arrow'})`}
      className={`transition-colors ${statusClass}`}
    />
  );
}

interface MapNodeProps {
  loop: Loop;
  step: LoopStepDefinition;
  number: number;
  selected: boolean;
  onSelect: () => void;
  style: React.CSSProperties;
}

function MapNode({ loop, step, number, selected, onSelect, style }: MapNodeProps) {
  const status = loop.runtime.stepStates[step.id]?.status ?? 'pending';
  const routeState = mapRouteState(loop, step);
  const statusStyle = STEP_STATUS_STYLE[status];

  return (
    <button
      type="button"
      className={`absolute flex flex-col justify-between rounded-md border p-2.5 text-left transition-all hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${NODE_STATUS_CLASS[status]} ${routeState === 'not-taken' ? 'opacity-45' : ''} ${selected ? 'ring-2 ring-sky-500/60' : ''}`}
      style={style}
      onClick={onSelect}
      aria-pressed={selected}
      title={step.title}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">{number}</span>
        <span className="truncate text-base font-medium">{step.title}</span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
          {statusStyle.label}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {step.produces?.length ? <GitBranch className="h-3.5 w-3.5" aria-label="Decision" /> : null}
          {step.when ? <Circle className="h-3.5 w-3.5" aria-label="Conditional route" /> : null}
          {step.gate ? <ShieldCheck className="h-3.5 w-3.5" aria-label="Approval gate" /> : null}
          {step.fanOut ? <span className="text-xs" aria-label={`Up to ${step.fanOut.maxItems} parallel items`}>×{step.fanOut.maxItems}</span> : null}
          {step.feedback ? <span className="text-xs text-violet-400" aria-label="Feedback route">↩</span> : null}
        </span>
      </span>
    </button>
  );
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
      <p className="min-w-0 flex-1 text-muted-foreground">{step.instructions}</p>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-xs font-normal">{step.execution.type}</Badge>
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
