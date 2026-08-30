/**
 * AttentionWidget — the cross-loop "Needs you" inbox for the dashboard.
 *
 * Every question a loop is parked on and every improvement suggestion waiting
 * for approve/reject, resolved from the watched index alone. Loops only move
 * when these are answered, so this is the one orchestrator signal that always
 * deserves a glance. Composed from the shared @sero-ai/ui dashboard set.
 */

import type { ComponentType } from 'react';
import { ActivityList, ActivityListItem } from '@sero-ai/ui/components/dashboard/activity-list';
import { DataBoundary } from '@sero-ai/ui/components/dashboard/data-boundary';
import { EmptyState } from '@sero-ai/ui/components/dashboard/empty-state';
import { Inline, Stack, WidgetContent } from '@sero-ai/ui/components/dashboard/layout';
import { Status } from '@sero-ai/ui/components/dashboard/status';
import { type Tone } from '@sero-ai/ui/components/dashboard/tone';
import { CheckCircle2, MessageCircleQuestion, ShieldQuestion, Sparkles } from 'lucide-react';
import type { LoopSummary } from '../../shared/types';
import { useOrchestratorIndex } from '../lib/use-orchestrator-index';
import { useGoalIndex } from '../lib/use-goal-index';
import { goalNeedsAttention } from '../lib/attention-count';
import '../styles.css';

/** How many items the inbox peeks before "+N more". */
const SHOWN = 5;

interface AttentionRow {
  key: string;
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  label: string;
  loopTitle: string;
}

/** Flatten a loop's attention payload into inbox rows (questions, then suggestions). */
function rowsFor(loop: LoopSummary): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const input = loop.attention?.input;
  if (input) {
    for (const q of input.questions) {
      rows.push({
        key: `${loop.id}:${input.requestId}:${q.id}`,
        icon: q.kind === 'approval' ? ShieldQuestion : MessageCircleQuestion,
        tone: 'warning',
        label: q.prompt,
        loopTitle: loop.title,
      });
    }
  }
  const suggestions = loop.attention?.suggestions ?? [];
  if (suggestions.length === 1) {
    rows.push({
      key: `${loop.id}:${suggestions[0].id}`,
      icon: Sparkles,
      tone: 'info',
      label: suggestions[0].rationale,
      loopTitle: loop.title,
    });
  } else if (suggestions.length > 1) {
    rows.push({
      key: `${loop.id}:suggestions`,
      icon: Sparkles,
      tone: 'info',
      label: `${suggestions.length} improvement suggestions`,
      loopTitle: loop.title,
    });
  }
  return rows;
}

export function AttentionWidget() {
  const { loops } = useOrchestratorIndex();
  const { goals } = useGoalIndex();
  const goalRows: AttentionRow[] = goals.flatMap((goal) => goalNeedsAttention(goal) ? [{
    key: `${goal.id}:goal`,
    icon: MessageCircleQuestion,
    tone: 'warning' as const,
    label: goal.blockReason ?? goal.waitReason ?? 'Held after repeated turns with no progress',
    loopTitle: `Goal · ${goal.objective}`,
  }] : []);
  const rows = [...goalRows, ...loops.flatMap(rowsFor)];
  // Count the real pending items, not the displayed rows — multiple suggestions
  // on one loop collapse into a single row, so `rows.length` would undercount.
  // This matches LoopsWidget's "Needs you" metric (pendingInput + suggestions).
  const pending = goalRows.length + loops.reduce(
    (n, l) => n + (l.attention?.input?.questions.length ?? 0) + (l.attention?.suggestions?.length ?? 0),
    0,
  );

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="center">
          <Status tone={pending > 0 ? 'warning' : 'success'} pulse={pending > 0}>
            {pending > 0 ? `${pending} waiting on you` : 'All clear'}
          </Status>
        </Inline>

        <DataBoundary
          state={rows.length === 0 ? 'empty' : 'ready'}
          empty={<EmptyState icon={CheckCircle2} title="Nothing needs you" />}
        >
          <Stack gap="none" scroll>
            <ActivityList overflowCount={Math.max(0, rows.length - SHOWN)}>
              {rows.slice(0, SHOWN).map((row) => (
                <ActivityListItem
                  key={row.key}
                  icon={row.icon}
                  tone={row.tone}
                  label={<span title={row.label}>{row.label}</span>}
                  detail={row.loopTitle}
                />
              ))}
            </ActivityList>
          </Stack>
        </DataBoundary>
      </Stack>
    </WidgetContent>
  );
}

export default AttentionWidget;
