/**
 * LoopsWidget — the loop fleet at a glance for the dashboard.
 *
 * How many loops are running / active / blocked, how many things wait on the
 * user, and the loops that matter most right now (running and blocked first)
 * with their step progress. Follows the watched index.json, so it updates
 * live as runs progress. Composed from the shared @sero-ai/ui dashboard set.
 */

import type { ReactNode } from 'react';
import {
  ActivityList,
  ActivityListItem,
  DataBoundary,
  EmptyState,
  Inline,
  Metric,
  MetricCard,
  Stack,
  Status,
  WidgetContent,
  type Tone,
} from '@sero-ai/ui';
import { Infinity as InfinityIcon, MessageCircleQuestion } from 'lucide-react';
import type { LoopStatus, LoopSummary } from '../../shared/types';
import { useOrchestratorIndex } from '../lib/use-orchestrator-index';
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

  const running = loops.filter((l) => l.progress?.running).length;
  const active = loops.filter((l) => l.status === 'active').length;
  const blocked = loops.filter((l) => l.status === 'blocked').length;
  const needsYou = loops.reduce(
    (n, l) => n + (l.pendingInput ?? 0) + (l.pendingSuggestions ?? 0),
    0,
  );
  const sorted = [...loops].sort((a, b) => urgency(a) - urgency(b));

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="center">
          <Status tone={running > 0 ? 'success' : 'neutral'} pulse={running > 0}>
            {running > 0 ? `${running} running` : `${active} active`}
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
          state={loops.length === 0 ? 'empty' : 'ready'}
          empty={<EmptyState icon={InfinityIcon} title="No workflows yet" />}
        >
          <Stack gap="none" scroll>
            <ActivityList overflowCount={Math.max(0, loops.length - SHOWN)}>
              {sorted.slice(0, SHOWN).map((loop) => (
                <ActivityListItem
                  key={loop.id}
                  tone={loopTone(loop.status)}
                  label={<span title={loop.summary}>{loop.title}</span>}
                  timestamp={progressCell(loop)}
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
