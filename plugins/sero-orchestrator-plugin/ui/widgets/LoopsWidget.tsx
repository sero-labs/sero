/**
 * LoopsWidget — the loop fleet at a glance for the dashboard.
 *
 * How many loops are running / active / blocked, how many things wait on the
 * user, and the loops that matter most right now (running and blocked first)
 * with their step progress. Follows the watched index.json, so it updates
 * live as runs progress. Composed from the shared @sero-ai/ui dashboard set.
 */

import type { ReactNode } from 'react';
import { ActivityList, ActivityListItem } from '@sero-ai/ui/components/dashboard/activity-list';
import { DataBoundary } from '@sero-ai/ui/components/dashboard/data-boundary';
import { EmptyState } from '@sero-ai/ui/components/dashboard/empty-state';
import { Inline, Stack, WidgetContent } from '@sero-ai/ui/components/dashboard/layout';
import { Metric, MetricCard } from '@sero-ai/ui/components/dashboard/metric';
import { Status } from '@sero-ai/ui/components/dashboard/status';
import { type Tone } from '@sero-ai/ui/components/dashboard/tone';
import { Infinity as InfinityIcon, MessageCircleQuestion } from 'lucide-react';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { useOrchestratorIndex } from '../lib/use-orchestrator-index';
import { useGoalIndex } from '../lib/use-goal-index';
import type { GoalIndexEntry } from '../../shared/goal-types';
import { goalNeedsAttention } from '../lib/attention-count';
import '../styles.css';

/** How many loops the list peeks before "+N more". */
const SHOWN = 4;

/** Loop status → semantic tone (matches the app's state language). */
function loopTone(status: LoopStatus): Tone {
  switch (status) {
    case 'active':
      return 'success';
    case 'blocked':
      return 'warning';
    case 'complete':
      return 'info';
    default:
      return 'neutral'; // draft / disabled
  }
}

/** Sort key: running loops first, then needs-you, blocked, active, the rest. */
function urgency(loop: LoopSummary): number {
  if (loop.progress?.running) return 0;
  if ((loop.pendingInput ?? 0) > 0 || (loop.pendingSuggestions ?? 0) > 0) return 1;
  if (loop.status === 'blocked') return 2;
  if (loop.status === 'active') return 3;
  if (loop.status === 'draft') return 4;
  return 5;
}

/** Right-hand cell: live step progress while running, otherwise plain counts. */
function progressCell(loop: LoopSummary): ReactNode {
  const p = loop.progress;
  if (!p) return null;
  const counts = `${p.done}/${p.total}`;
  return p.running ? (
    <Status tone="success" pulse>
      {counts}
    </Status>
  ) : (
    counts
  );
}

export function LoopsWidget() {
  const { loops } = useOrchestratorIndex();
  const { goals } = useGoalIndex();

  const running = loops.filter((l) => l.progress?.running).length;
  const activeGoals = goals.filter((goal) => goal.status === 'active' && !goal.closedAt);
  const active = loops.filter((l) => l.status === 'active').length + activeGoals.length;
  const blocked = loops.filter((l) => l.status === 'blocked').length
    + goals.filter((goal) => goal.status === 'blocked' && !goal.closedAt).length;
  const needsYou = goals.filter(goalNeedsAttention).length + loops.reduce(
    (n, l) => n + (l.pendingInput ?? 0) + (l.pendingSuggestions ?? 0),
    0,
  );
  const sorted = [...loops].sort((a, b) => urgency(a) - urgency(b));
  const activeItems: Array<{ kind: 'workflow'; value: LoopSummary } | { kind: 'goal'; value: GoalIndexEntry }> = [
    ...sorted.map((value) => ({ kind: 'workflow' as const, value })),
    ...activeGoals.map((value) => ({ kind: 'goal' as const, value })),
  ];

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="center">
          <Status tone={running + activeGoals.length > 0 ? 'success' : 'neutral'} pulse={running + activeGoals.length > 0}>
            {running + activeGoals.length > 0 ? `${running + activeGoals.length} running · ${activeGoals.length} goal${activeGoals.length === 1 ? '' : 's'}` : `${active} active`}
          </Status>
          {blocked > 0 && (
            <Status tone="warning" variant="pill">
              {blocked} blocked
            </Status>
          )}
        </Inline>

        <Inline gap="sm" wrap>
          <MetricCard className="flex-1">
            <Metric label="Active" value={active} icon={InfinityIcon} />
          </MetricCard>
          <MetricCard className="flex-1">
            <Metric
              label="Needs you"
              value={needsYou}
              icon={MessageCircleQuestion}
              tone={needsYou > 0 ? 'warning' : undefined}
            />
          </MetricCard>
        </Inline>

        <DataBoundary
          state={activeItems.length === 0 ? 'empty' : 'ready'}
          empty={<EmptyState icon={InfinityIcon} title="No active Orchestrator work" />}
        >
          <Stack gap="none" scroll>
            <ActivityList overflowCount={Math.max(0, activeItems.length - SHOWN)}>
              {activeItems.slice(0, SHOWN).map((item) => item.kind === 'workflow' ? (
                <ActivityListItem key={item.value.id} tone={loopTone(item.value.status)} label={<span title={item.value.summary}>{item.value.title}</span>} timestamp={progressCell(item.value)} />
              ) : (
                <ActivityListItem
                  key={item.value.id}
                  tone="success"
                  label={<span title={item.value.objective}>{item.value.objective}</span>}
                  detail="Goal"
                  timestamp={`${item.value.automaticTurns ?? 0}/${item.value.maxAutomaticTurns ?? '∞'}`}
                />
              ))}
            </ActivityList>
          </Stack>
        </DataBoundary>
      </Stack>
    </WidgetContent>
  );
}

export default LoopsWidget;
