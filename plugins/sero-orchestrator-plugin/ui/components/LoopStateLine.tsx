/**
 * What the Workflow is doing, in the same words and the same glyph its row on
 * the Workflows list uses, with the two facts that explain a Workflow which is
 * armed but not running: how many events are waiting, and whether the source
 * that feeds it is answering.
 *
 * Those two used to be chips on the settings line, beside settings the user
 * chose. They are not settings. They say why nothing has happened yet, which
 * belongs with the state, and they stay grey because neither asks the user for
 * anything.
 */

import { sessionStartedAt } from '@sero-ai/common';
import type { GithubSourceHealth, LoopSummary, Loop, WebhookSourceHealth } from '../../shared/types';
import { formatRelative } from '../lib/format';
import { loopActivity } from '../lib/loop-activity';
import { sourceHealthChips } from '../lib/trigger-summary';
import { ActivityWord } from './ActivityWord';

export function LoopStateLine({
  loop,
  summary,
  runCount = 0,
  githubHealth = null,
  webhookHealth = null,
}: {
  loop: Loop;
  /** The watched index entry. Null while the index has not caught up with a new Workflow. */
  summary: LoopSummary | null;
  /** How many times it has run. The list shows this in its own column. */
  runCount?: number;
  githubHealth?: GithubSourceHealth | null;
  webhookHealth?: WebhookSourceHealth | null;
}) {
  const activity = summary ? loopActivity(summary, sessionStartedAt()) : null;
  // When it last ran and how often, which the list carries in separate columns
  // and this page has nowhere else to put.
  const tail = [
    summary?.lastRunAt ? formatRelative(summary.lastRunAt) : null,
    runCount > 0 ? `${runCount} run${runCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');
  const queued = loop.runtime.pendingEvents ?? [];
  const health = sourceHealthChips(loop, githubHealth, webhookHealth);
  if (!activity && queued.length === 0 && health.length === 0) return null;

  const next = queued[0]?.summary ?? queued[0]?.source;
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-room-text3">
      {activity && (
        <ActivityWord
          state={activity.state}
          word={tail ? `${activity.line} · ${tail}` : activity.line}
          nextStep={activity.nextStep}
        />
      )}
      {queued.length > 0 && (
        <span>
          {queued.length} event{queued.length === 1 ? '' : 's'} queued{next ? ` · next: ${next}` : ''}
        </span>
      )}
      {health.map((chip) => (
        <span key={chip.key}>{chip.label}</span>
      ))}
    </p>
  );
}
